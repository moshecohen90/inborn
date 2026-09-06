import { prepareDevModel } from "./devModel";
import { isTauri, prepareTauri } from "./tauri";

/** Browsers HEAD-probe the served GGUF; the desktop shell lists its vault instead (its CSP has no `connect-src 'self'`). */
export const prepareEngine = (): Promise<void> => (isTauri() ? prepareTauri() : prepareDevModel());
