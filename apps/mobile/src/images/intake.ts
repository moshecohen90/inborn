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

/** A turn never leaves while a photo is still being prepared: it would go out as text and the photo would stay behind (F350). */
export const composerCanSend = ({ text, preparing, busy, disabled }: { text: string; preparing: number; busy: boolean; disabled?: boolean }): boolean => !!text.trim() && preparing <= 0 && !busy && !disabled;
