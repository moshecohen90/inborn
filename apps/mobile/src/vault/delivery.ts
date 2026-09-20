import type { CatalogManifest, CatalogModel, DeliverySource, InstallEvent } from "@inborn/core";

/** What the vault tells the user before a single byte moves (spec §5.1: "exactly which host and why"). */
export interface DeliveryPlan {
  via: DeliverySource;
  /** Human-readable origin: "Google Play", "models.inbornapp.com", "this app". */
  origin: string;
  host?: string;
  bytes: number;
}

/** One interface per platform (spec §5.4 "the same manifest describes every path"). Events feed the install reducer. */
export interface ModelDelivery {
  /** Null when this platform cannot deliver the model (sideloaded Android, web): the vault offers import instead. */
  plan(model: CatalogModel): DeliveryPlan | null;
  /** Starts (or resumes) delivery; resolves with the local file path once bytes are complete, before hashing. */
  deliver(model: CatalogModel, emit: (e: InstallEvent) => void): Promise<string>;
  pause(model: CatalogModel): Promise<void>;
  cancel(model: CatalogModel): Promise<void>;
  /** Removes the delivered bytes (pack or file). */
  remove(model: CatalogModel): Promise<void>;
  /** Where the delivered file is right now, if it is (used by the boot scan). */
  locate(model: CatalogModel): string | null;
}

export interface DeliveryContext {
  manifest: CatalogManifest;
  wifiOnly: () => boolean;
  /** Paused-download state persisted across restarts, keyed by model id. */
  savedDownload: (id: string) => unknown;
  saveDownload: (id: string, state: unknown | null) => void;
}

/**
 * Play Core only binds inside an app Play itself installed; a sideload, an emulator without Play services or a stripped
 * build gets a bind failure instead of a pack, and the message it throws is raw Java (QA F26).
 */
const PLAY_UNAVAILABLE = /play-unavailable|failed to bind|service is not (?:available|connected)|api not available|play store/i;
export const isPlayUnavailable = (message: string): boolean => PLAY_UNAVAILABLE.test(message);
