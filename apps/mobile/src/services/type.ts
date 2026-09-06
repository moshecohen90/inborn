import { useMemo } from "react";
import { Platform, StyleSheet, type TextStyle } from "react-native";
import { fontFace, scaledStep, typeScale, type FontKind, type FontWeightInput, type TypeName, type TypeStep } from "@inborn/ui";
import { useTextScale } from "./theme";

const platform = Platform.OS === "web" ? "web" : "native";

/** The `fontFamily` + `fontWeight` pair for a bundled Plex face, resolved once per platform (§9.3). Use it wherever a text style is not one of the scale steps. */
export function font(kind: FontKind = "sans", weight: FontWeightInput = "400"): Pick<TextStyle, "fontFamily" | "fontWeight"> {
  return fontFace(kind, weight, platform);
}

export type TypeStyles = Record<TypeName | "headline" | "mono" | "strong", TextStyle> & { scale: number };

function textStyle(step: TypeStep): TextStyle {
  return {
    ...font(step.font, step.fontWeight),
    fontSize: step.fontSize,
    lineHeight: step.lineHeight,
    ...(step.letterSpacing !== undefined ? { letterSpacing: step.letterSpacing } : {}),
    ...(step.uppercase ? { textTransform: "uppercase" as const } : {}),
  };
}

const cache = new Map<number, TypeStyles>();

/** The whole §9.3 scale at one text-size setting, built once per scale value. */
export function typeAt(scale: number): TypeStyles {
  const hit = cache.get(scale);
  if (hit) return hit;
  const steps = {} as Record<TypeName, TextStyle>;
  for (const k of Object.keys(typeScale) as TypeName[]) steps[k] = textStyle(scaledStep(typeScale[k], scale));
  const sheet = StyleSheet.create({ ...steps, headline: steps.display, mono: steps.monoReadout, strong: font("sans", "600") });
  const built: TypeStyles = { ...sheet, scale };
  cache.set(scale, built);
  return built;
}

/** Text styles for the current text-size setting: `const type = useType()` then `style={[type.body, …]}`. */
export function useType(): TypeStyles {
  const scale = useTextScale();
  return useMemo(() => typeAt(scale), [scale]);
}
