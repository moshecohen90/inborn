import type { ReactNode } from "react";
import { Pressable, StyleSheet, Switch, Text, View, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import Svg, { Circle, Defs, Pattern, Rect } from "react-native-svg";
import { radius } from "@inborn/ui";
import { useTheme, FONT } from "../../services/theme";
import { useAppServices } from "../../services/AppServices";

export function useShellType() {
  const { prefs } = useAppServices();
  return prefs.textScale;
}

/** Plex Mono, uppercase, +0.08em: telemetry and labels only, never paragraphs (§9.3). */
export function MonoLabel({ children, color, style, testID }: { children: ReactNode; color?: string; style?: StyleProp<TextStyle>; testID?: string }) {
  const { theme } = useTheme();
  return (
    <Text testID={testID} style={[styles.monoLabel, { color: color ?? theme.text3 }, style]}>
      {children}
    </Text>
  );
}

export function Mono({ children, color, style, testID }: { children: ReactNode; color?: string; style?: StyleProp<TextStyle>; testID?: string }) {
  const { theme } = useTheme();
  return (
    <Text testID={testID} style={[styles.mono, { color: color ?? theme.text2 }, style]}>
      {children}
    </Text>
  );
}

type ButtonVariant = "cta" | "secondary" | "link" | "danger";

export function Button({
  title,
  onPress,
  variant = "cta",
  disabled,
  testID,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { theme } = useTheme();
  const bg = variant === "cta" ? theme.ctaFill : variant === "danger" ? theme.danger : variant === "secondary" ? theme.surface2 : "transparent";
  const fg = variant === "cta" ? theme.ctaText : variant === "danger" ? "#FFFFFF" : variant === "link" ? theme.text2 : theme.text;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        variant === "link" ? styles.link : null,
        { backgroundColor: bg, borderColor: variant === "secondary" ? theme.border : "transparent", opacity: disabled ? 0.4 : pressed ? 0.85 : 1 },
        style,
      ]}
    >
      <Text style={[styles.buttonText, variant === "link" ? styles.linkText : null, { color: fg }]}>{title}</Text>
    </Pressable>
  );
}

/** Settings row: label, optional explanation, and a value / switch / chevron at the end (§9.4: 44 pt minimum). */
export function Row({
  label,
  sub,
  value,
  onPress,
  toggle,
  onToggle,
  chevron,
  danger,
  testID,
  disabled,
}: {
  label: string;
  sub?: string;
  value?: string;
  onPress?: () => void;
  toggle?: boolean;
  onToggle?: (v: boolean) => void;
  chevron?: boolean;
  danger?: boolean;
  testID?: string;
  disabled?: boolean;
}) {
  const { theme } = useTheme();
  const body = (
    <>
      <View style={styles.rowText}>
        <Text style={[styles.rowLabel, { color: danger ? theme.danger : theme.text }]}>{label}</Text>
        {sub ? <Text style={[styles.rowSub, { color: theme.text2 }]}>{sub}</Text> : null}
      </View>
      {value ? <Text style={[styles.rowValue, { color: theme.text2 }]}>{value}</Text> : null}
      {onToggle ? <Switch value={!!toggle} onValueChange={onToggle} disabled={disabled} trackColor={{ true: theme.sealed }} /> : null}
      {chevron ? <Text style={[styles.chevron, { color: theme.text3 }]}>›</Text> : null}
    </>
  );
  const style = [styles.row, { borderBottomColor: theme.border, opacity: disabled ? 0.5 : 1 }];
  if (onPress && !disabled)
    return (
      <Pressable testID={testID} accessibilityRole="button" onPress={onPress} style={({ pressed }) => [style, pressed ? { backgroundColor: theme.surface1 } : null]}>
        {body}
      </Pressable>
    );
  return (
    <View testID={testID} style={style}>
      {body}
    </View>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <MonoLabel style={styles.sectionTitle}>{title}</MonoLabel>
      {children}
    </View>
  );
}

/** A choice made of chips (§9.4 radius 4, mono): Immediately / 1 min / 5 min, Eco / Balanced / Max … */
export function Segmented<T extends string | number>({ options, value, onChange, testID }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; testID?: string }) {
  const { theme } = useTheme();
  return (
    <View testID={testID} style={styles.segmented}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.value)}
            style={[styles.segment, { backgroundColor: on ? theme.surface2 : "transparent", borderColor: on ? theme.text2 : theme.border }]}
          >
            <Text style={[styles.segmentText, { color: on ? theme.text : theme.text2 }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** The Faraday dot grid: white at 3 %, 8 px spacing; only under vault and onboarding surfaces, never behind chat text. */
export function Mesh() {
  const { scheme } = useTheme();
  const dot = scheme === "light" ? "#12161B" : "#FFFFFF";
  return (
    <Svg pointerEvents="none" style={StyleSheet.absoluteFill} width="100%" height="100%">
      <Defs>
        <Pattern id="mesh" patternUnits="userSpaceOnUse" width={8} height={8}>
          <Circle cx={1} cy={1} r={0.75} fill={dot} fillOpacity={0.03} />
        </Pattern>
      </Defs>
      <Rect width="100%" height="100%" fill="url(#mesh)" />
    </Svg>
  );
}

export const shellStyles = StyleSheet.create({
  headline: { fontFamily: FONT.sans, fontSize: 32, lineHeight: 38, fontWeight: "600", letterSpacing: -0.64 },
  title: { fontFamily: FONT.sans, fontSize: 22, lineHeight: 28, fontWeight: "600", letterSpacing: -0.22 },
  heading: { fontFamily: FONT.sans, fontSize: 17, lineHeight: 24, fontWeight: "600" },
  body: { fontFamily: FONT.sans, fontSize: 16, lineHeight: 25 },
  bodySmall: { fontFamily: FONT.sans, fontSize: 14, lineHeight: 20 },
  caption: { fontFamily: FONT.sans, fontSize: 12, lineHeight: 16, fontWeight: "500" },
  card: { borderWidth: 1, borderRadius: radius.card, padding: 16, gap: 8 },
  well: { borderWidth: 1, borderRadius: radius.control, padding: 12 },
});

const styles = StyleSheet.create({
  monoLabel: { fontFamily: FONT.mono, fontSize: 11, lineHeight: 14, fontWeight: "500", letterSpacing: 0.88, textTransform: "uppercase" },
  mono: { fontFamily: FONT.mono, fontSize: 12, lineHeight: 16 },
  button: { minHeight: 48, paddingHorizontal: 20, borderRadius: radius.control, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  buttonText: { fontFamily: FONT.sans, fontSize: 16, fontWeight: "600" },
  link: { minHeight: 44, borderWidth: 0 },
  linkText: { fontWeight: "400", fontSize: 14 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 52, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  rowText: { flex: 1, gap: 2 },
  rowLabel: { fontFamily: FONT.sans, fontSize: 16, lineHeight: 22 },
  rowSub: { fontFamily: FONT.sans, fontSize: 13, lineHeight: 18 },
  rowValue: { fontFamily: FONT.sans, fontSize: 15 },
  chevron: { fontSize: 22, lineHeight: 24 },
  section: { gap: 0, paddingTop: 20 },
  sectionTitle: { paddingBottom: 6 },
  segmented: { flexDirection: "row", gap: 8, flexWrap: "wrap", paddingVertical: 8 },
  segment: { minHeight: 36, paddingHorizontal: 12, justifyContent: "center", borderWidth: 1, borderRadius: radius.tag },
  segmentText: { fontFamily: FONT.mono, fontSize: 12, letterSpacing: 0.5 },
});
