/** Phones scan the vault (devModel.native.ts), the web asks its host for a GGUF (devModel.web.ts); both resolve before the first createEngine(). */
export { prepareDevModel as prepareEngine } from "./devModel";
