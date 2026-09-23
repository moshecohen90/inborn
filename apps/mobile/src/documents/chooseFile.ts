import { File } from "expo-file-system";

/** One picked file, in the two shapes every caller needs: a URI the library can read, and the text for a record check. */
export interface ChosenFile {
  uri: string;
  name: string;
  text(): Promise<string>;
}

/** The system picker. `mimeTypes` narrows it where the caller knows the kinds it accepts. */
export async function chooseFile(mimeTypes?: readonly string[]): Promise<ChosenFile | null> {
  const picked = await File.pickFileAsync(mimeTypes ? { multipleFiles: false, mimeTypes: [...mimeTypes] } : { multipleFiles: false });
  if (picked.canceled) return null;
  const file = picked.result;
  return { uri: file.uri, name: file.name, text: async () => file.textSync() };
}
