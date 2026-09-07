import * as Speech from "expo-speech";
import { writeDevResult } from "../adapters/devModel";
import { DEV_AUTOVOICE_SAY } from "./devFlags";

const live: Record<string, unknown> = {};

/** Merges one section into dev-run.json (see DEV_AUTOVOICE_SAY); a no-op unless the phrase is set at bundle time. */
export function devVoiceRecord(section: string, data: unknown): void {
  if (!DEV_AUTOVOICE_SAY) return;
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
