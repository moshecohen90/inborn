import { requireOptionalNativeModule } from "expo";

/** com.google.android.play.core.assetpacks.model.AssetPackStatus */
export const AssetPackStatus = {
  UNKNOWN: 0,
  PENDING: 1,
  DOWNLOADING: 2,
  TRANSFERRING: 3,
  COMPLETED: 4,
  FAILED: 5,
  CANCELED: 6,
  WAITING_FOR_WIFI: 7,
  NOT_INSTALLED: 8,
  REQUIRES_USER_CONFIRMATION: 9,
} as const;
export type AssetPackStatus = (typeof AssetPackStatus)[keyof typeof AssetPackStatus];

export interface AssetPackState {
  name: string;
  status: AssetPackStatus;
  errorCode: number;
  bytesDownloaded: number;
  totalBytes: number;
}

interface NativeAssetPacks {
  getPackPath(packName: string): string | null;
  fetch(packName: string): Promise<AssetPackState | null>;
  getPackState(packName: string): Promise<AssetPackState | null>;
}

/** Android only (Play Asset Delivery); iOS and web have no native part, so every call is a no-op returning null. */
const native = requireOptionalNativeModule<NativeAssetPacks>("AssetPacks");

/** Absolute path of the pack's assets directory once Play has delivered it, else null. */
export function getPackPath(packName: string): string | null {
  return native?.getPackPath(packName) ?? null;
}

/** Asks Play to download the pack; resolves with the state at request time (poll getPackState for progress). */
export async function fetchPack(packName: string): Promise<AssetPackState | null> {
  return native ? native.fetch(packName) : null;
}

export async function getPackState(packName: string): Promise<AssetPackState | null> {
  return native ? native.getPackState(packName) : null;
}
