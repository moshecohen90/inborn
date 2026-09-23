import { primeHead, registerBlob } from "./files";
import type { ChosenFile } from "./chooseFile";

export type { ChosenFile } from "./chooseFile";

/**
 * A browser has no `File.pickFileAsync`: expo-file-system's web build resolves to nothing (QA F100). The chooser is an
 * `<input type="file">` of our own, clicked with nothing awaited above it so it stays inside the gesture that opened it.
 */
function openChooser(accept: string): Promise<globalThis.File | null> {
  const doc = (globalThis as { document?: Document }).document;
  if (!doc) return Promise.resolve(null);
  const input = doc.createElement("input");
  input.type = "file";
  if (accept) input.accept = accept;
  input.multiple = false;
  input.style.display = "none";
  doc.body.appendChild(input);
  const picked = new Promise<globalThis.File | null>((resolve) => {
    let settled = false;
    const done = (file: globalThis.File | null) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(file);
    };
    input.addEventListener("change", () => done(input.files?.[0] ?? null));
    /* Chrome/Safari fire `cancel` on dismiss; a browser without it leaves the hidden input parked until the tab goes. */
    input.addEventListener("cancel", () => done(null));
  });
  input.click();
  return picked;
}

export async function chooseFile(mimeTypes?: readonly string[]): Promise<ChosenFile | null> {
  const file = await openChooser(mimeTypes?.join(",") ?? "");
  if (!file) return null;
  const uri = registerBlob(file, file.name);
  await primeHead(uri);
  return { uri, name: file.name, text: () => file.text() };
}
