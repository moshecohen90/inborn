import { Platform } from "react-native";
import { File, Paths } from "expo-file-system";
import { AssetPackStatus, fetchPack, getPackPath, getPackState } from "../../modules/asset-packs";
import type { Engine } from "./index";
import { LlamaRnLM } from "./llamaRn";

/** M1 dev path: a GGUF pushed by hand into the app's document directory (README "Run on a phone"). The catalog replaces this in M2. */
export const DEV_MODEL_FILE = "instant.gguf";
/** Android: the same file arrives as a Play Asset Delivery fast-follow pack (plugins/withAssetPacks.js). */
export const MODEL_PACK = "inborn_model";

export function devModelEngine(): Engine | null {
  const packDir = Platform.OS === "android" ? getPackPath(MODEL_PACK) : null;
  const packFile = packDir ? new File(`file://${packDir}`, DEV_MODEL_FILE) : null;
  const file = packFile?.exists ? packFile : new File(Paths.document, DEV_MODEL_FILE);
  console.log(`[inborn] instant model from ${file === packFile ? `asset pack ${MODEL_PACK}` : "document directory"}: ${file.uri} (exists=${file.exists})`);
  if (file.exists) return { engine: new LlamaRnLM(), model: { id: "instant", uri: file.uri } };
  if (Platform.OS === "android" && !packDir) void fetchModelPack();
  return null;
}

/* Play may not have finished a fast-follow pack by first launch (nor bundletool local testing); asking Play makes the next launch find it. */
async function fetchModelPack(): Promise<void> {
  const inFlight: number[] = [AssetPackStatus.PENDING, AssetPackStatus.DOWNLOADING, AssetPackStatus.TRANSFERRING, AssetPackStatus.WAITING_FOR_WIFI];
  try {
    let state = await fetchPack(MODEL_PACK);
    for (let i = 0; state && inFlight.includes(state.status) && i < 600; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      state = await getPackState(MODEL_PACK);
    }
    console.log(`[inborn] ${MODEL_PACK}: status ${state?.status} (${state?.bytesDownloaded}/${state?.totalBytes} bytes), path ${getPackPath(MODEL_PACK)}`);
  } catch (e: unknown) {
    console.warn(`[inborn] ${MODEL_PACK}: ${e instanceof Error ? e.message : String(e)}`);
  }
}
