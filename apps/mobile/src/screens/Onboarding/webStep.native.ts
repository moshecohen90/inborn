/* Native reads the vault, and this file keeps src/web (OPFS, the download worker) out of the phone bundle. */
export const webStepActive = (): boolean => false;
export const WebModelStep = (): null => null;
