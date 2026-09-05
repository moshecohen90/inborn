import { File } from "expo-file-system";
import { sha256 } from "@noble/hashes/sha256";
import { chunksOf, readGgufHeader, type GgufInfo } from "@inborn/core";
import { hasVaultNative, sha256File } from "../../modules/vault-native";

/** SHA-256 of a file on disk: native streaming where the module exists, JS streaming otherwise (web, tests). */
export async function fileSha256(file: File): Promise<string> {
  if (hasVaultNative()) return sha256File(file.uri);
  const h = sha256.create();
  for await (const chunk of chunksOf(file.readableStream())) h.update(chunk);
  return Array.from(h.digest(), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Reads only the GGUF header from a local file (spec §10.1 #8); throws GgufError on anything unusable. */
export const fileGgufHeader = (file: File): Promise<GgufInfo> => readGgufHeader(chunksOf(file.readableStream()));
