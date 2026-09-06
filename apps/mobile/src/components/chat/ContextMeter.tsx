import { StyleSheet, View } from "react-native";
import { contextLevel } from "@inborn/core";
import { useTheme } from "../../lib/theme";

/** 2px hairline above the composer (§9.6): neutral below 80 %, accent from 80 %, danger from 92 % when the summary is due. The green stays with the seal (§9.9). */
export function ContextMeter({ fullness }: { fullness: number }) {
  const theme = useTheme();
  const level = contextLevel(fullness);
  const color = level === "full" ? theme.danger : level === "warn" ? theme.accent : theme.text3;
  const pct = Math.round(Math.min(1, Math.max(0, fullness)) * 100);
  return (
    <View testID="context-meter" accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: pct }} style={[styles.track, { backgroundColor: theme.border }]}>
      <View testID={`context-level-${level}`} style={[styles.fill, { width: `${pct}%`, backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: 2, marginHorizontal: 12, borderRadius: 1, overflow: "hidden" },
  fill: { height: 2, borderRadius: 1 },
});
