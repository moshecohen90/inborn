import type { PickedImage, PickOutcome } from "./pick";

type Pick = (onPicked: (count: number) => void) => Promise<PickOutcome>;

/** Holds the composer from the moment the picker hands photos over until their scaled copies are in it (F350). */
export async function pickIntoComposer(pick: Pick, io: { hold: (delta: number) => void; add: (images: PickedImage[]) => void }): Promise<PickOutcome> {
  let held = 0;
  try {
    const r = await pick((count) => {
      held = count;
      io.hold(count);
    });
    if (r.ok) io.add(r.images);
    return r;
  } finally {
    if (held) io.hold(-held);
  }
}

/** Send is held only for an empty draft, a reply that is streaming, or a model that failed to load (`disabled`); a model still loading never holds it. */
export const composerCanSend = ({ text, busy, disabled }: { text: string; busy: boolean; disabled?: boolean }): boolean => !!text.trim() && !busy && !disabled;

interface SendInput {
  text: string;
  busy: boolean;
  modelReady: boolean;
  /** Photos picked but not yet scaled into the composer. */
  preparing: number;
}

/**
 * A tap on Send: out now, or queued until the model is loaded and every photo is in the composer. A turn never leaves
 * while a photo is being prepared, or it would go out as text and the photo would stay behind (F350).
 */
export const planSend = ({ text, busy, modelReady, preparing }: SendInput): "now" | "queue" | "none" => (!text.trim() || busy ? "none" : modelReady && preparing <= 0 ? "now" : "queue");

/** A queued send leaves the moment nothing holds it any more; emptying the composer withdraws it. */
export const flushQueued = (input: SendInput & { queued: boolean }): "send" | "drop" | "wait" => (!input.queued ? "wait" : !input.text.trim() ? "drop" : planSend(input) === "now" ? "send" : "wait");
