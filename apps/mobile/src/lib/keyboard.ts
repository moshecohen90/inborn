import { useEffect, useState } from "react";
import { Keyboard, LayoutAnimation, Platform, type KeyboardEvent, type KeyboardEventName } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { keyboardLift } from "./keyboardLayout";

const SHOW: KeyboardEventName = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
const HIDE: KeyboardEventName = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

/** Keyboard top above the window bottom (0 when hidden). Edge-to-edge Android never resizes the window, so every screen and sheet pads itself by this. */
export function useKeyboardLift(): number {
  const insets = useSafeAreaInsets();
  const [height, setHeight] = useState(() => (Platform.OS === "web" ? 0 : (Keyboard.metrics()?.height ?? 0)));
  useEffect(() => {
    if (Platform.OS === "web") return;
    const onChange = (e: KeyboardEvent, next: number) => {
      if (Platform.OS === "ios" && e.duration) LayoutAnimation.configureNext({ duration: e.duration, update: { type: LayoutAnimation.Types.keyboard } });
      setHeight(next);
    };
    const subs = [Keyboard.addListener(SHOW, (e) => onChange(e, e.endCoordinates.height)), Keyboard.addListener(HIDE, (e) => onChange(e, 0))];
    return () => subs.forEach((s) => s.remove());
  }, []);
  return keyboardLift(height, insets.bottom, Platform.OS);
}
