/**
 * Headless voice proofs (emulators cannot speak): dev bundles only, store builds never set these.
 * EXPO_PUBLIC_AUTOVOICE: comma-separated 16 kHz WAV names under the app document directory; each is transcribed with
 * whisper (auto language) and the results (load ms, transcribe ms, text, language) land in Documents/dev-run.json.
 * EXPO_PUBLIC_AUTOVOICE_TTS=1 also reads the first transcript aloud and records the synthesiser's start latency.
 */
export const DEV_AUTOVOICE: string[] = (process.env.EXPO_PUBLIC_AUTOVOICE ?? "").split(",").filter(Boolean);
export const DEV_AUTOVOICE_TTS: boolean = process.env.EXPO_PUBLIC_AUTOVOICE_TTS === "1";
