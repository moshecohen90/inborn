import { describe, expect, it } from "vitest";
import { MAX_SILENT_ROUNDS, initialHandsFree, nextHandsFree, type HandsFreeEvent, type HandsFreeState } from "../src/voice/handsFree";

function drive(events: HandsFreeEvent[], from: HandsFreeState = initialHandsFree) {
  let state = from;
  const effects: string[] = [];
  for (const e of events) {
    const r = nextHandsFree(state, e);
    state = r.state;
    effects.push(...r.effects.map((x) => x.type));
  }
  return { state, effects };
}

describe("hands-free loop", () => {
  it("runs one full round: listen → transcribe → think → speak → listen", () => {
    const { state, effects } = drive([{ type: "start" }, { type: "speech-end", audioMs: 1800 }, { type: "transcript", text: "What time is it?" }, { type: "answer", text: "I cannot see a clock." }, { type: "spoken" }]);
    expect(effects).toEqual(["listen", "stop-listening", "transcribe", "generate", "speak", "listen"]);
    expect(state.phase).toBe("listening");
    expect(state.turns).toEqual([
      { role: "user", text: "What time is it?" },
      { role: "assistant", text: "I cannot see a clock." },
    ]);
    expect(state.silentRounds).toBe(0);
  });

  it("a tap while speaking stops the voice and listens again; while thinking it stops generation", () => {
    const speaking = drive([{ type: "start" }, { type: "speech-end", audioMs: 1 }, { type: "transcript", text: "hi" }, { type: "answer", text: "hello" }]).state;
    const a = nextHandsFree(speaking, { type: "interrupt" });
    expect(a.state.phase).toBe("listening");
    expect(a.effects.map((e) => e.type)).toEqual(["stop-speaking", "listen"]);
    const thinking = drive([{ type: "start" }, { type: "speech-end", audioMs: 1 }, { type: "transcript", text: "hi" }]).state;
    const b = nextHandsFree(thinking, { type: "interrupt" });
    expect(b.effects.map((e) => e.type)).toEqual(["stop-generating", "listen"]);
    expect(b.state.turns).toHaveLength(1);
  });

  it("a tap while listening only closes the utterance", () => {
    const r = nextHandsFree(drive([{ type: "start" }]).state, { type: "interrupt" });
    expect(r.state.phase).toBe("listening");
    expect(r.effects.map((e) => e.type)).toEqual(["stop-listening"]);
  });

  it("empty transcripts count as silence: hint after two, end after five", () => {
    let state = drive([{ type: "start" }]).state;
    for (let i = 1; i < MAX_SILENT_ROUNDS; i++) {
      state = nextHandsFree(state, { type: "transcript", text: " " }).state;
      expect(state.phase).toBe("listening");
      expect(state.note).toBe(i >= 2 ? "voice.saySomething" : null);
    }
    const r = nextHandsFree(state, { type: "no-speech" });
    expect(r.state.phase).toBe("ended");
    expect(r.state.note).toBe("voice.endedQuiet");
    expect(r.effects.map((e) => e.type)).toEqual(["end"]);
  });

  it("pause stops whatever runs, resume listens again, and events during the pause are ignored", () => {
    const thinking = drive([{ type: "start" }, { type: "speech-end", audioMs: 1 }, { type: "transcript", text: "q" }]).state;
    const p = nextHandsFree(thinking, { type: "pause", reason: "thermal" });
    expect(p.state.phase).toBe("paused");
    expect(p.state.note).toBe("voice.paused.thermal");
    expect(p.effects.map((e) => e.type)).toEqual(["stop-generating"]);
    const ignored = nextHandsFree(p.state, { type: "answer", text: "late" });
    expect(ignored.state.phase).toBe("paused");
    expect(ignored.effects).toEqual([]);
    const r = nextHandsFree(p.state, { type: "resume" });
    expect(r.state.phase).toBe("listening");
    expect(r.state.pausedFor).toBeNull();
    expect(r.effects.map((e) => e.type)).toEqual(["listen"]);
  });

  it("stop ends from any phase with the matching cleanup, and an ended session is inert", () => {
    const speaking = drive([{ type: "start" }, { type: "speech-end", audioMs: 1 }, { type: "transcript", text: "hi" }, { type: "answer", text: "yo" }]).state;
    const s = nextHandsFree(speaking, { type: "stop" });
    expect(s.state.phase).toBe("ended");
    expect(s.effects.map((e) => e.type)).toEqual(["stop-speaking", "end"]);
    expect(nextHandsFree(s.state, { type: "start" }).effects).toEqual([]);
  });

  it("an empty answer goes back to listening with a note; an error ends the session", () => {
    const thinking = drive([{ type: "start" }, { type: "speech-end", audioMs: 1 }, { type: "transcript", text: "q" }]).state;
    const a = nextHandsFree(thinking, { type: "answer", text: "" });
    expect(a.state.phase).toBe("listening");
    expect(a.state.note).toBe("voice.noAnswer");
    const e = nextHandsFree(thinking, { type: "error", message: "boom" });
    expect(e.state.phase).toBe("ended");
    expect(e.effects.map((x) => x.type)).toEqual(["stop-generating", "end"]);
  });

  it("out-of-phase events do nothing", () => {
    const listening = drive([{ type: "start" }]).state;
    expect(nextHandsFree(listening, { type: "spoken" }).effects).toEqual([]);
    expect(nextHandsFree(listening, { type: "answer", text: "x" }).state.phase).toBe("listening");
    expect(nextHandsFree(listening, { type: "start" }).effects).toEqual([]);
  });
});
