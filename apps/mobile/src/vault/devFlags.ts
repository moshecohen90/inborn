/**
 * Bundle-time switches for simulator/emulator runs against scripts/serve-models.mjs. EXPO_PUBLIC_DEV_MODEL_HOST names
 * the one extra host a dev bundle may fetch models from; store builds never set it, so release bundles keep the
 * compiled-in allowlist only (spec §5.1).
 */
export const DEV_MODEL_HOST: string | undefined = process.env.EXPO_PUBLIC_DEV_MODEL_HOST || undefined;
export const devBuild = (): boolean => __DEV__ || DEV_MODEL_HOST !== undefined;
export const DEV_MODELS_BASE_URL: string | undefined = process.env.EXPO_PUBLIC_MODELS_BASE_URL || undefined;
export const DEV_RAM_GB: number = Number(process.env.EXPO_PUBLIC_DEV_RAM_GB ?? NaN);
/** Headless simulator/emulator proofs (no tap possible): the vault installs this catalog id on mount. Dev bundles only. */
export const DEV_AUTOINSTALL: string | undefined = process.env.EXPO_PUBLIC_AUTOINSTALL === "file" ? undefined : process.env.EXPO_PUBLIC_AUTOINSTALL || undefined;
/** EXPO_PUBLIC_AUTOINSTALL=file: a phone adb cannot tap (OnePlus 6T) takes vault commands (`install|use|remove <id>`, `import <uri>`) from this file under the document directory; consumed once read. */
export const DEV_VAULT_FILE: string | undefined = process.env.EXPO_PUBLIC_AUTOINSTALL === "file" ? "dev-vault.txt" : undefined;
/** Headless import proof: comma-separated file names under the app document directory, imported on mount. Dev bundles only. */
export const DEV_AUTOIMPORT: string[] = (process.env.EXPO_PUBLIC_AUTOIMPORT ?? "").split(",").filter(Boolean);
