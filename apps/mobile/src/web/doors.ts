import { isTauri } from "../adapters/tauri";

/**
 * Whether the browser doors (notice strip, phone door, download door, engine switch) apply to this runtime.
 * The desktop shell is a browser only in name: its model comes from the Rust vault, so it never ran the web
 * boot those doors read (adapters/prepare.web.ts) and a download door there would gate a model already present.
 */
export const webDoorsApply = (): boolean => !isTauri();
