import { Text, View } from "react-native";
import type { PersonaIcon } from "@inborn/core";
import { useTheme } from "../../lib/theme";

/* Geometric glyphs, not emoji (§8.5 S41); an SVG set can replace the map without touching callers. */
const GLYPHS: Record<PersonaIcon, string> = { spark: "✦", pen: "✎", book: "▤", globe: "◎", code: "‹›", scale: "⚖", heart: "♡", briefcase: "▣", flask: "⚗", compass: "✧" };

export function PersonaGlyph({ icon, size = 28, active }: { icon: PersonaIcon; size?: number; active?: boolean }) {
  const theme = useTheme();
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 1, borderColor: active ? theme.accent : theme.border, backgroundColor: theme.surface2, alignItems: "center", justifyContent: "center" }}>
      <Text allowFontScaling={false} style={{ color: active ? theme.accent : theme.text2, fontSize: size * 0.5 }}>
        {GLYPHS[icon] ?? "✦"}
      </Text>
    </View>
  );
}
