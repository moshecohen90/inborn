import * as Speech from "expo-speech";
import { writeDevResult } from "../adapters/devModel";
import { DEV_AUTOVOICE_SAY, DEV_VOICE_LIVE } from "./devFlags";

const live: Record<string, unknown> = {};

/** Merges one section into dev-run.json (see DEV_VOICE_LIVE); a no-op unless a live flag is set at bundle time. */
export function devVoiceRecord(section: string, data: unknown): void {
  if (!DEV_VOICE_LIVE) return;
  live[section] = data;
  live.at = new Date().toISOString();
  try {
    writeDevResult({ live });
  } catch {
    /* proof channel only */
  }
}

/** Speaks the proof phrase through the phone's speaker shortly after a listener opened (real mic in, real speaker out). */
export function devUtter(stage: string): void {
  if (!DEV_AUTOVOICE_SAY) return;
  const phrase = DEV_AUTOVOICE_SAY;
  setTimeout(() => {
    devVoiceRecord(`utter.${stage}`, { at: Date.now(), phrase });
    Speech.speak(phrase, { language: "en-US", volume: 0.45, rate: 0.95, onError: (e) => devVoiceRecord(`utterError.${stage}`, String(e)) });
  }, 1000);
}
