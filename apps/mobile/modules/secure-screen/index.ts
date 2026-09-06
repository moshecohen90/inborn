import { requireOptionalNativeModule } from "expo";
import { Platform } from "react-native";

interface NativeSecureScreen {
  setSecure(secure: boolean): Promise<void>;
  isSecure(): boolean;
  isCaptured(): boolean;
  addListener?(event: "onCapturedChange", listener: (e: { captured: boolean }) => void): { remove(): void };
}

const native = requireOptionalNativeModule<NativeSecureScreen>("SecureScreen");

/** Android: FLAG_SECURE on the activity window. iOS/web: no-op (iOS has no API to block a screenshot). */
export async function setSecure(secure: boolean): Promise<boolean> {
  if (!native) return false;
  await native.setSecure(secure);
  return true;
}

export const canBlockScreenshots = (): boolean => Platform.OS === "android" && native !== null;

/** iOS: true while the screen is mirrored or recorded (UIScreen.isCaptured). Elsewhere always false. */
export function isCaptured(): boolean {
  return native?.isCaptured() ?? false;
}

export function onCapturedChange(listener: (captured: boolean) => void): () => void {
  const sub = native?.addListener?.("onCapturedChange", (e) => listener(e.captured));
  return () => sub?.remove();
}
