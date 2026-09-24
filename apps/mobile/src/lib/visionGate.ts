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
