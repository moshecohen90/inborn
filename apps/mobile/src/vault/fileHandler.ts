import { useEffect } from "react";
import { Linking } from "react-native";

/** URLs the OS hands us as the registered `.gguf` handler (spec §7.2): file:// on iOS, content:// or file:// on Android. */
export function isGgufOpenUrl(url: string | null | undefined): url is string {
  if (!url) return false;
  const lower = url.toLowerCase();
  if (lower.startsWith("inborn://")) return false;
  return lower.startsWith("file:") || lower.startsWith("content:");
}

/** Delivers the launch URL once and every later "open with Inborn" while the app runs. */
export function useGgufOpenHandler(onOpen: (url: string) => void): void {
  useEffect(() => {
    let alive = true;
    Linking.getInitialURL()
      .then((url) => {
        if (alive && isGgufOpenUrl(url)) onOpen(url);
      })
      .catch(() => undefined);
    const sub = Linking.addEventListener("url", ({ url }) => {
      if (isGgufOpenUrl(url)) onOpen(url);
    });
    return () => {
      alive = false;
      sub.remove();
    };
  }, [onOpen]);
}
