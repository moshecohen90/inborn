import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import { SECURE_ITEMS } from "../storage/secureItems";

const ITEM = SECURE_ITEMS.passcode;
const OPTIONS: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

async function read(): Promise<string | null> {
  if (Platform.OS === "web") return globalThis.localStorage?.getItem(ITEM) ?? null;
  return SecureStore.getItemAsync(ITEM, OPTIONS);
}

async function write(value: string | null): Promise<void> {
  if (Platform.OS === "web") {
    if (value === null) globalThis.localStorage?.removeItem(ITEM);
    else globalThis.localStorage?.setItem(ITEM, value);
    return;
  }
  if (value === null) await SecureStore.deleteItemAsync(ITEM, OPTIONS);
  else await SecureStore.setItemAsync(ITEM, value, OPTIONS);
}

const digest = (salt: string, code: string) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${salt}:${code}`);

/** Salted SHA-256 in the Keychain/Keystore (web: the origin's storage). The code itself is never stored. */
export async function setPasscode(code: string): Promise<void> {
  const salt = Array.from(await Crypto.getRandomBytesAsync(16), (b) => b.toString(16).padStart(2, "0")).join("");
  await write(`${salt}:${await digest(salt, code)}`);
}

export const clearPasscode = (): Promise<void> => write(null);

export async function hasPasscode(): Promise<boolean> {
  return (await read()) !== null;
}

export async function verifyPasscode(code: string): Promise<boolean> {
  const stored = await read();
  if (!stored) return false;
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  return (await digest(salt, code)) === hash;
}
