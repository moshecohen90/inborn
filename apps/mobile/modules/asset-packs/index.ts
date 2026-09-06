import { requireOptionalNativeModule } from "expo";

export interface EventSubscription {
  remove(): void;
}

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

/** com.google.android.play.core.assetpacks.model.AssetPackErrorCode (the ones the vault explains). */
export const AssetPackErrorCode = {
  NO_ERROR: 0,
  APP_UNAVAILABLE: -1,
  PACK_UNAVAILABLE: -2,
  INVALID_REQUEST: -3,
  DOWNLOAD_NOT_FOUND: -4,
  API_NOT_AVAILABLE: -5,
  NETWORK_ERROR: -6,
  ACCESS_DENIED: -7,
  INSUFFICIENT_STORAGE: -10,
  PLAY_STORE_NOT_FOUND: -11,
  NETWORK_UNRESTRICTED: -12,
  APP_NOT_OWNED: -13,
  CONFIRMATION_NOT_REQUIRED: -14,
  UNRECOGNIZED_INSTALLATION: -15,
  INTERNAL_ERROR: -100,
} as const;

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
  cancel(packName: string): AssetPackState | null;
  removePack(packName: string): Promise<void>;
  showConfirmationDialog(): Promise<number>;
  addListener(event: "onPackState", listener: (state: AssetPackState) => void): EventSubscription;
}

/** Android only (Play Asset Delivery); iOS and web have no native part, so every call is a no-op returning null. */
const native = requireOptionalNativeModule<NativeAssetPacks>("AssetPacks");

export const hasAssetPacks = (): boolean => native !== null;

/** Absolute path of the pack's assets directory once Play has delivered it, else null. */
export function getPackPath(packName: string): string | null {
  return native?.getPackPath(packName) ?? null;
}

/** Asks Play to download the pack; resolves with the state at request time (subscribe with addPackListener for progress). */
export async function fetchPack(packName: string): Promise<AssetPackState | null> {
  return native ? native.fetch(packName) : null;
}

export async function getPackState(packName: string): Promise<AssetPackState | null> {
  return native ? native.getPackState(packName) : null;
}

export function cancelPack(packName: string): AssetPackState | null {
  return native?.cancel(packName) ?? null;
}

export async function removePack(packName: string): Promise<void> {
  await native?.removePack(packName);
}

/** Play's confirmation for cellular / large packs; resolves with Activity.RESULT_OK (-1) or RESULT_CANCELED (0). */
export async function showPackConfirmation(): Promise<number> {
  return native ? native.showConfirmationDialog() : 0;
}

export function addPackListener(listener: (state: AssetPackState) => void): EventSubscription {
  return native ? native.addListener("onPackState", listener) : { remove() {} };
}
