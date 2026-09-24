import type { WebStepModels } from "./webStep";

/* Native reads the vault, and this file keeps src/web (OPFS, the download worker) out of the phone bundle. */
export const webStepModels = (): WebStepModels | null => null;
export const webChooseModel = async (): Promise<void> => undefined;
