import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

/* Small JSON values in the Keychain / Keystore (web: the origin's storage), the same way the app-lock passcode is kept. */
const OPTIONS: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

export async function readSecureJson<T>(item: string): Promise<T | null> {
  try {
    const raw = Platform.OS === "web" ? (globalThis.localStorage?.getItem(item) ?? null) : await SecureStore.getItemAsync(item, OPTIONS);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export async function writeSecureJson(item: string, value: unknown | null): Promise<void> {
  if (Platform.OS === "web") {
    if (value === null) globalThis.localStorage?.removeItem(item);
    else globalThis.localStorage?.setItem(item, JSON.stringify(value));
    return;
  }
  if (value === null) await SecureStore.deleteItemAsync(item, OPTIONS);
  else await SecureStore.setItemAsync(item, JSON.stringify(value), OPTIONS);
}
