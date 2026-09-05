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
export const DEV_AUTOINSTALL: string | undefined = process.env.EXPO_PUBLIC_AUTOINSTALL || undefined;
/** Headless import proof: comma-separated file names under the app document directory, imported on mount. Dev bundles only. */
export const DEV_AUTOIMPORT: string[] = (process.env.EXPO_PUBLIC_AUTOIMPORT ?? "").split(",").filter(Boolean);
