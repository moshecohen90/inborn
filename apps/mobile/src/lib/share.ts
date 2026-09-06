import { Platform } from "react-native";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import type { ExportFile } from "@inborn/core";

/** Hands a generated file to the system share sheet; the file lives in the app cache and never leaves by itself. */
export async function shareFile(file: ExportFile, dialogTitle: string): Promise<boolean> {
  if (Platform.OS === "web") {
    const doc = (globalThis as { document?: Document }).document;
    if (!doc) return false;
    const url = URL.createObjectURL(new Blob([file.body], { type: file.mimeType }));
    const a = doc.createElement("a");
    a.href = url;
    a.download = file.filename;
    a.click();
    URL.revokeObjectURL(url);
    return true;
  }
  if (!(await Sharing.isAvailableAsync())) return false;
  const out = new File(Paths.cache, file.filename);
  out.write(file.body);
  await Sharing.shareAsync(out.uri, { mimeType: file.mimeType, dialogTitle, UTI: file.mimeType === "application/json" ? "public.json" : "public.plain-text" });
  return true;
}
