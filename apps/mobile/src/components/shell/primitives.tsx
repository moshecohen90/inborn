import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import Svg, { Circle, Defs, Pattern, Rect } from "react-native-svg";
import { useTranslation } from "react-i18next";
import { Icon, MIN_TOUCH, radius } from "@inborn/ui";
import { useActionMaxWidth } from "../../lib/useLayout";
import { useTheme } from "../../services/theme";
import { font, useType } from "../../services/type";

/** Plex Mono, uppercase, +0.08em: telemetry and labels only, never paragraphs (§9.3). */
export function MonoLabel({ children, color, style, testID }: { children: ReactNode; color?: string; style?: StyleProp<TextStyle>; testID?: string }) {
  const { theme } = useTheme();
  const type = useType();
  const { i18n } = useTranslation();
  /* Uppercase and tracking carry the label in Latin and do nothing to CJK, where Plex also falls back: those
     locales get the step in weight and ink instead, or a section header reads as body text (§9.3, round 51). */
  const cjk = CJK_LOCALES.has(i18n.language.split("-")[0] ?? "");
  return (
    <Text testID={testID} style={[type.monoLabel, cjk ? styles.monoLabelCjk : null, { color: color ?? (cjk ? theme.text2 : theme.text3) }, style]}>
      {children}
    </Text>
  );
}

const CJK_LOCALES = new Set(["ja", "ko", "zh"]);

export function Mono({ children, color, style, testID }: { children: ReactNode; color?: string; style?: StyleProp<TextStyle>; testID?: string }) {
  const { theme } = useTheme();
  const type = useType();
  return (
    <Text testID={testID} style={[type.mono, { color: color ?? theme.text2 }, style]}>
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
  const type = useType();
  const bg = variant === "cta" ? theme.ctaFill : variant === "danger" ? theme.danger : variant === "secondary" ? theme.surface2 : "transparent";
  const fg = variant === "cta" ? theme.ctaText : variant === "danger" ? theme.onDanger : variant === "link" ? theme.text2 : theme.text;
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
        { backgroundColor: bg, borderColor: variant === "secondary" ? theme.border : "transparent", opacity: disabled ? DISABLED_OPACITY : pressed ? 0.85 : 1 },
        style,
      ]}
    >
      <Text style={[type.body, type.strong, variant === "link" ? type.bodySmall : null, { color: fg }]}>{title}</Text>
    </Pressable>
  );
}

export const TOGGLE_TRACK = { width: 52, height: 32 };
export const TOGGLE_KNOB = 24;
const TOGGLE_INSET = (TOGGLE_TRACK.height - TOGGLE_KNOB) / 2;

/**
 * §9.9: the sealed green belongs to the seal alone, so on/off is told by fill, not by hue. ON is the filled CTA
 * surface with a ticked knob at the end; OFF is a hollow track outlined in text3 with a muted knob at the start.
 * The platform Switch could not say which side was on (QA F102): iOS painted both tracks a near-background grey and
 * gave the knob the surface colour, so in dark mode the whole control disappeared.
 */
export function Toggle({ value, onChange, disabled, testID, label }: { value: boolean; onChange: (v: boolean) => void; disabled?: boolean; testID?: string; label?: string }) {
  const { theme } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value, disabled: !!disabled }}
      disabled={disabled}
      onPress={() => onChange(!value)}
      style={styles.toggleTarget}
    >
      <View style={[styles.track, { backgroundColor: value ? theme.ctaFill : theme.well, borderColor: value ? theme.ctaFill : theme.text3, opacity: disabled ? DISABLED_OPACITY : 1 }]}>
        <View style={[styles.knob, value ? styles.knobOn : styles.knobOff, { backgroundColor: value ? theme.ctaText : theme.text3 }]}>{value ? <Icon name="check" size={14} color={theme.ctaFill} strokeWidth={3} /> : null}</View>
      </View>
    </Pressable>
  );
}

/** A stack of page-level actions: full width on a phone, never wider than a button on a wide window (§8.9, F110). */
export function Actions({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.actions, { maxWidth: useActionMaxWidth() }, style]}>{children}</View>;
}

/** One dimming for every control that exists but cannot be used yet. */
export const DISABLED_OPACITY = 0.4;

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
  const type = useType();
  const body = (
    <>
      <View style={styles.rowText}>
        <Text style={[type.body, { color: danger ? theme.danger : disabled ? theme.text2 : theme.text }]}>{label}</Text>
        {sub ? <Text style={[type.bodySmall, { color: theme.text2 }]}>{sub}</Text> : null}
      </View>
      {value ? <Text style={[type.bodySmall, { color: theme.text2 }]}>{value}</Text> : null}
      {onToggle ? <Toggle value={!!toggle} onChange={onToggle} disabled={disabled} label={label} /> : null}
      {chevron ? <Icon name="chevronRight" size={20} color={theme.text3} style={disabled ? { opacity: DISABLED_OPACITY } : undefined} /> : null}
    </>
  );
  /* An off row is told by its control and by the label dropping to text2, never by fading the sentence that says why:
     at 0.5 that explanation measured 2.28:1 (QA F242). */
  const style = [styles.row, { borderBottomColor: theme.border }];
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
  const type = useType();
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
            <Text style={[type.mono, { color: on ? theme.text : theme.text2 }]}>{o.label}</Text>
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

/** Layout shapes shared by the shell screens; text goes through useType(). */
export const shellStyles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: radius.card, padding: 16, gap: 8 },
  well: { borderWidth: 1, borderRadius: radius.control, padding: 12 },
});

const styles = StyleSheet.create({
  toggleTarget: { minHeight: MIN_TOUCH, justifyContent: "center" },
  track: { width: TOGGLE_TRACK.width, height: TOGGLE_TRACK.height, borderRadius: TOGGLE_TRACK.height / 2, borderWidth: 1, flexDirection: "row", alignItems: "center", paddingHorizontal: TOGGLE_INSET },
  knob: { width: TOGGLE_KNOB, height: TOGGLE_KNOB, borderRadius: TOGGLE_KNOB / 2, alignItems: "center", justifyContent: "center" },
  knobOn: { marginLeft: "auto" },
  knobOff: { marginRight: "auto" },
  actions: { width: "100%", alignSelf: "center", gap: 8 },
  button: { minHeight: 48, paddingHorizontal: 20, borderRadius: radius.control, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  link: { minHeight: 44, borderWidth: 0 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 52, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  rowText: { flex: 1, gap: 2 },
  section: { gap: 0, paddingTop: 20 },
  sectionTitle: { paddingBottom: 6 },
  monoLabelCjk: { ...font("sans", "600"), letterSpacing: 0 },
  segmented: { flexDirection: "row", gap: 8, flexWrap: "wrap", paddingVertical: 8 },
  segment: { minHeight: MIN_TOUCH, paddingHorizontal: 12, justifyContent: "center", borderWidth: 1, borderRadius: radius.tag },
});
