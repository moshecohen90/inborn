import type { ViewProps } from "react-native";

export type HiddenFromScreenReaders = Pick<ViewProps, "aria-hidden" | "accessibilityElementsHidden" | "importantForAccessibility">;

/**
 * Props that hide a decorative element (and its children) from VoiceOver, TalkBack and browser screen readers.
 * react-native-svg hands its props to the DOM untranslated on web, so the RN names would land there as junk attributes.
 */
export function hiddenFromScreenReaders(os: string): HiddenFromScreenReaders {
  return os === "web" ? { "aria-hidden": true } : { accessibilityElementsHidden: true, importantForAccessibility: "no-hide-descendants" };
}
