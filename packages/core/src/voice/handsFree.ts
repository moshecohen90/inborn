/**
 * The hands-free loop (S44): listen → transcribe → think → speak → listen again, until the user ends it. A pure
 * reducer: the screen feeds events, receives the next state plus the side effects to run, and nothing here touches
 * audio or the model. "Tap to interrupt" while speaking or thinking drops straight back to listening (§7.4).
 */
export type HandsFreePhase = "idle" | "listening" | "transcribing" | "thinking" | "speaking" | "paused" | "ended";

export interface HandsFreeTurn {
  role: "user" | "assistant";
  text: string;
}

export interface HandsFreeState {
  phase: HandsFreePhase;
  turns: HandsFreeTurn[];
  /** Live transcript while listening / transcribing; the answer while thinking / speaking. */
  live: string;
  /** i18n key of the one-line status under the seal, null when the phase says enough. */
  note: string | null;
  /** Why the loop is paused (device guard); null otherwise. */
  pausedFor: "thermal" | "memory" | "background" | "call" | null;
  /** Consecutive empty listens; two in a row show the "say something" hint, five end the session. */
  silentRounds: number;
}

export type HandsFreeEvent =
  | { type: "start" }
  | { type: "speech-end"; audioMs: number }
  | { type: "transcript"; text: string; language?: string }
  | { type: "no-speech" }
  | { type: "answer"; text: string }
  | { type: "spoken" }
  | { type: "interrupt" }
  | { type: "pause"; reason: NonNullable<HandsFreeState["pausedFor"]> }
  | { type: "resume" }
  | { type: "stop" }
  | { type: "error"; message: string };

export type HandsFreeEffect =
  | { type: "listen" }
  | { type: "stop-listening" }
  | { type: "transcribe" }
  | { type: "generate"; text: string }
  | { type: "stop-generating" }
  | { type: "speak"; text: string }
  | { type: "stop-speaking" }
  | { type: "end" };

export const MAX_SILENT_ROUNDS = 5;

export const initialHandsFree: HandsFreeState = { phase: "idle", turns: [], live: "", note: null, pausedFor: null, silentRounds: 0 };

export function nextHandsFree(state: HandsFreeState, event: HandsFreeEvent): { state: HandsFreeState; effects: HandsFreeEffect[] } {
  const go = (patch: Partial<HandsFreeState>, effects: HandsFreeEffect[] = []) => ({ state: { ...state, ...patch }, effects });
  if (state.phase === "ended") return go({});
  switch (event.type) {
    case "start":
      return state.phase === "idle" ? go({ phase: "listening", live: "", note: null }, [{ type: "listen" }]) : go({});
    case "stop":
      return go({ phase: "ended", live: "", note: null }, [...stopAll(state.phase), { type: "end" }]);
    case "pause":
      if (state.phase === "paused") return go({ pausedFor: event.reason });
      return go({ phase: "paused", pausedFor: event.reason, live: "", note: `voice.paused.${event.reason}` }, stopAll(state.phase));
    case "resume":
      return state.phase === "paused" ? go({ phase: "listening", pausedFor: null, note: null }, [{ type: "listen" }]) : go({});
    case "error":
      return go({ phase: "ended", note: null, live: event.message }, [...stopAll(state.phase), { type: "end" }]);
    case "interrupt":
      /* Tap while the model talks or thinks: cut it and listen again; while listening, the tap ends the current utterance. */
      if (state.phase === "speaking") return go({ phase: "listening", live: "", note: null }, [{ type: "stop-speaking" }, { type: "listen" }]);
      if (state.phase === "thinking") return go({ phase: "listening", live: "", note: null }, [{ type: "stop-generating" }, { type: "listen" }]);
      if (state.phase === "listening") return go({}, [{ type: "stop-listening" }]);
      return go({});
    case "speech-end":
      if (state.phase !== "listening") return go({});
      return go({ phase: "transcribing", note: null }, [{ type: "stop-listening" }, { type: "transcribe" }]);
    case "no-speech": {
      if (state.phase !== "listening" && state.phase !== "transcribing") return go({});
      const silentRounds = state.silentRounds + 1;
      if (silentRounds >= MAX_SILENT_ROUNDS) return go({ phase: "ended", silentRounds, note: "voice.endedQuiet" }, [{ type: "end" }]);
      return go({ phase: "listening", silentRounds, live: "", note: silentRounds >= 2 ? "voice.saySomething" : null }, [{ type: "listen" }]);
    }
    case "transcript": {
      if (state.phase !== "transcribing" && state.phase !== "listening") return go({});
      const text = event.text.trim();
      if (!text) return nextHandsFree(state, { type: "no-speech" });
      return go({ phase: "thinking", live: text, note: null, silentRounds: 0, turns: [...state.turns, { role: "user", text }] }, [{ type: "generate", text }]);
    }
    case "answer": {
      if (state.phase !== "thinking") return go({});
      const text = event.text.trim();
      if (!text) return go({ phase: "listening", live: "", note: "voice.noAnswer" }, [{ type: "listen" }]);
      return go({ phase: "speaking", live: text, turns: [...state.turns, { role: "assistant", text }] }, [{ type: "speak", text }]);
    }
    case "spoken":
      return state.phase === "speaking" ? go({ phase: "listening", live: "", note: null }, [{ type: "listen" }]) : go({});
  }
}

function stopAll(phase: HandsFreePhase): HandsFreeEffect[] {
  switch (phase) {
    case "listening":
    case "transcribing":
      return [{ type: "stop-listening" }];
    case "thinking":
      return [{ type: "stop-generating" }];
    case "speaking":
      return [{ type: "stop-speaking" }];
    default:
      return [];
  }
}

/** System prompt line for spoken answers: short, plain, no Markdown (the phone reads it aloud). */
export const VOICE_SYSTEM_HINT = "This is a spoken conversation. Answer in one to three short plain sentences in the language the user spoke. No Markdown, no lists, no code, no emoji.";
