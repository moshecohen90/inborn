/**
 * Headless emulator/simulator proofs (nothing can tap the screen over USB): dev bundles only, store builds never set these.
 * EXPO_PUBLIC_AUTOINDEX: comma-separated file names under the app document directory, imported and indexed on mount.
 * EXPO_PUBLIC_AUTOASK: a question asked over the whole library once indexing is done; the answer, citations and timings
 * land in Documents/dev-run.json next to the M1 numbers.
 */
export const DEV_AUTOINDEX: string[] = (process.env.EXPO_PUBLIC_AUTOINDEX ?? "").split(",").filter(Boolean);
export const DEV_AUTOASK: string | undefined = process.env.EXPO_PUBLIC_AUTOASK || undefined;
export const DEV_AUTOASK_STRICT: boolean = process.env.EXPO_PUBLIC_AUTOASK_STRICT === "1";
/** After the imports settle, run OCR on every document that came back "needs OCR" (the proof for Vision / Tesseract). */
export const DEV_AUTOOCR: boolean = process.env.EXPO_PUBLIC_AUTOOCR === "1";
