import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import { HF_HOST, hfRepoInfoUrl, hfSearchUrl, parseHfRepoInfo, parseHfSearch, requestBytes, type HfRepo, type HfRepoInfo } from "@inborn/core";
import { recordTransfer } from "../proof/transfers";
import { SECURE_ITEMS } from "../storage/secureItems";

/** The in-app Hugging Face search (spec §7.2) exists where the app may open a socket on the user's request: iOS and the desktop. */
export const hfSearchAvailable = (): boolean => Platform.OS === "ios";

export type HfError = "offline" | "gated" | "rate-limited" | "server" | "bad-response";

export class HfRequestError extends Error {
  constructor(
    readonly kind: HfError,
    readonly status?: number,
  ) {
    super(kind);
  }
}

const TOKEN_OPTIONS: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

/** Token for gated repositories, Keychain only; never logged, sent only as a bearer header to huggingface.co. */
export async function readHfToken(): Promise<string | null> {
  try {
    return (await SecureStore.getItemAsync(SECURE_ITEMS.hfToken, TOKEN_OPTIONS)) || null;
  } catch {
    return null;
  }
}

export async function writeHfToken(token: string | null): Promise<void> {
  const value = token?.trim() ?? "";
  if (!value) await SecureStore.deleteItemAsync(SECURE_ITEMS.hfToken, TOKEN_OPTIONS);
  else await SecureStore.setItemAsync(SECURE_ITEMS.hfToken, value, TOKEN_OPTIONS);
}

export async function hfHeaders(): Promise<Record<string, string>> {
  const token = await readHfToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/* Only huggingface.co is ever fetched here (§5.1); the host is asserted, not trusted from the URL builder. */
async function getJson(url: string, signal?: AbortSignal): Promise<unknown> {
  if (new URL(url).hostname !== HF_HOST) throw new HfRequestError("bad-response");
  let response: Response;
  try {
    response = await fetch(url, { headers: { Accept: "application/json", ...(await hfHeaders()) }, signal });
  } catch (e: unknown) {
    if ((e as Error)?.name === "AbortError") throw e;
    throw new HfRequestError("offline");
  }
  const text = await response.text();
  recordTransfer({ host: HF_HOST, bytesOut: requestBytes(url), bytesIn: text.length, purpose: "search" });
  if (response.status === 401 || response.status === 403) throw new HfRequestError("gated", response.status);
  if (response.status === 429) throw new HfRequestError("rate-limited", response.status);
  if (!response.ok) throw new HfRequestError("server", response.status);
  try {
    return JSON.parse(text);
  } catch {
    throw new HfRequestError("bad-response", response.status);
  }
}

export async function hfSearch(query: string, signal?: AbortSignal): Promise<HfRepo[]> {
  return parseHfSearch(await getJson(hfSearchUrl(query), signal));
}

export async function hfRepoInfo(repo: string, signal?: AbortSignal): Promise<HfRepoInfo> {
  const info = parseHfRepoInfo(await getJson(hfRepoInfoUrl(repo), signal));
  if (!info) throw new HfRequestError("bad-response");
  return info;
}
