import { useLayoutEffect, type RefObject } from "react";
import { Platform, type View } from "react-native";
import { inertOutside, type InertNode } from "./inertOutside";

/** Web: while mounted, only the element behind `ref` (and dialogs opened after it) can take focus or be read aloud. */
export function useInertOutside(ref: RefObject<View | null>): void {
  useLayoutEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    const el = ref.current as unknown as HTMLElement | null;
    if (!el) return;
    /* Focus left on a control behind the lock would stay there, and Enter would still act on it. */
    if (document.activeElement instanceof HTMLElement && !el.contains(document.activeElement)) document.activeElement.blur();
    const body = document.body as unknown as InertNode;
    /* react-native-web keeps an empty body-level container per Modal; the lock's own passcode sheet renders into one later. */
    return inertOutside(el as unknown as InertNode, body, (n) => n.parentElement === body && n.children.length === 0);
  }, [ref]);
}
