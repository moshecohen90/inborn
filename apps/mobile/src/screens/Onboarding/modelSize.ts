/** Web: the host's GGUF size is unknown until the vault stream asks the server (HEAD). */
export function modelFileSize(_uri: string): number | null {
  return null;
}
