/**
 * Headless voice proofs (emulators cannot speak): dev bundles only, store builds never set these.
 * EXPO_PUBLIC_AUTOVOICE: comma-separated 16 kHz WAV names under the app document directory; each is transcribed with
 * whisper (auto language) and the results (load ms, transcribe ms, text, language) land in Documents/dev-run.json.
 * EXPO_PUBLIC_AUTOVOICE_TTS=1 also reads the first transcript aloud and records the synthesiser's start latency.
 */
export const DEV_AUTOVOICE: string[] = (process.env.EXPO_PUBLIC_AUTOVOICE ?? "").split(",").filter(Boolean);
export const DEV_AUTOVOICE_TTS: boolean = process.env.EXPO_PUBLIC_AUTOVOICE_TTS === "1";
/**
 * EXPO_PUBLIC_AUTOVOICE_SAY: a phrase the phone speaks through its own speaker ~1 s after every listener opens, so a
 * real microphone hears real audio on a phone nobody is talking to; each stage then lands in Documents/dev-run.json
 * under "live" (the only channel out of a Release build over USB).
 */
export const DEV_AUTOVOICE_SAY: string | undefined = process.env.EXPO_PUBLIC_AUTOVOICE_SAY || undefined;
/** EXPO_PUBLIC_AUTOVOICE_LIVE=1: record the live stages without the phone speaking (the sound comes from a person or the Mac). */
export const DEV_VOICE_LIVE: boolean = DEV_AUTOVOICE_SAY !== undefined || process.env.EXPO_PUBLIC_AUTOVOICE_LIVE === "1";
