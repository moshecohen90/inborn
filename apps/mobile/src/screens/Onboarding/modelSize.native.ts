import { File } from "expo-file-system";

export function modelFileSize(uri: string): number | null {
  if (!uri.startsWith("file://")) return null;
  try {
    const f = new File(uri);
    return f.exists ? (f.size ?? null) : null;
  } catch {
    return null;
  }
}
