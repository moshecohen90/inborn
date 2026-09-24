/**
 * What a chat turn carrying a picture does before the model is asked (QA F294).
 *
 * The first photo after a cold launch answered *"I can't see the photo. I don't have visual capabilities."*: the vault
 * had not finished scanning the disk, so the 205 MB projector read as absent, and the turn went out anyway. A picture
 * waits for its projector the same way an attached document waits to be read (F125/F126) — never answered around.
 */
export type VisionTurn =
  /** The projector is attached (or there is no picture): ask the model. */
  | { kind: "send" }
  /** The projector exists but is not attached yet: hold the turn and say so on screen. */
  | { kind: "wait" }
  /** Only an older turn carries pictures; the model that could see them already answered for them. */
  | { kind: "drop" }
  /** This picture cannot be looked at on this device: say which way out there is. */
  | { kind: "refuse"; offer: "switch" | "companion" };

export interface VisionTurnInput {
  /** The prompt carries at least one picture. */
  hasImages: boolean;
  /** The vault has scanned the disk, so "no projector installed" is an answer and not a cold-launch race. */
  vaultScanned: boolean;
  /** The resident chat model can use a projector at all (spec §6.1: only the Qwen3.5 chat models). */
  modelSees: boolean;
  /** The projector file resolved on disk. */
  projectorInstalled: boolean;
  /** The projector is already attached to the resident context. */
  projectorAttached: boolean;
  /** The picture is on the user's own last message, so this turn is the one being asked about it. */
  onLastUserMessage: boolean;
  /** Another model in the catalog could see it (the "switch" way out). */
  otherModelSees: boolean;
}

export function planVisionTurn(i: VisionTurnInput): VisionTurn {
  if (!i.hasImages) return { kind: "send" };
  if (i.projectorAttached) return { kind: "send" };
  /* Before the scan lands, every model looks like it has no projector: the one thing that must not happen is answering. */
  if (!i.vaultScanned) return { kind: "wait" };
  if (i.modelSees && i.projectorInstalled) return { kind: "wait" };
  if (!i.onLastUserMessage) return { kind: "drop" };
  return { kind: "refuse", offer: !i.modelSees && i.otherModelSees ? "switch" : "companion" };
}

/** What pressing Send does with photos in the composer (QA F343): go out, or stay in the composer behind the block card. */
export type PhotoSend = { kind: "send" } | { kind: "hold"; offer: "switch" | "companion" };

/**
 * A photo nothing on this device can look at is held before it becomes a message: a line saying so after the turn
 * was dismissed on the iPhone, the next turn dropped the picture, and the model answered that it got no image.
 */
export function planPhotoSend(i: Omit<VisionTurnInput, "projectorAttached" | "onLastUserMessage" | "vaultScanned">): PhotoSend {
  const verdict = planVisionTurn({ ...i, vaultScanned: true, projectorAttached: false, onLastUserMessage: true });
  return verdict.kind === "refuse" ? { kind: "hold", offer: verdict.offer } : { kind: "send" };
}

export interface PhotoGateDeps {
  hasImages: boolean;
  /** Resolves once the vault has read the disk, so a missing pack is an answer and not a cold-launch race (F294). */
  scanned: () => Promise<void>;
  verdict: () => PhotoSend;
  hold: (offer: "switch" | "companion") => void;
  send: () => Promise<void>;
}

/** Send, or hold the message and its photos in the composer; nothing is stored and nothing reaches the model while held. */
export async function gatePhotoSend(d: PhotoGateDeps): Promise<"sent" | "held"> {
  if (d.hasImages) {
    await d.scanned();
    const v = d.verdict();
    if (v.kind === "hold") {
      d.hold(v.offer);
      return "held";
    }
  }
  await d.send();
  return "sent";
}

/** The held turn goes out on its own the moment the pack becomes ready, from the chat's button or from the vault. */
export const releasesHeldTurn = (held: boolean, before: string | undefined, now: string): boolean => held && before !== "ready" && now === "ready";
