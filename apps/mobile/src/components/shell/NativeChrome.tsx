import { useRef, type ReactNode } from "react";
import { AccessibilityInfo, Animated, Platform, Pressable, StyleSheet, Text, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from "react-native";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { Icon, radius, type IconName } from "@inborn/ui";
import { useTheme } from "../../services/theme";
import { useType } from "../../services/type";
import { haptic } from "../../services/haptics";

/** §9.7: Liquid Glass on the navigation layer only, and only where iOS 26 renders it; every other platform gets a plain surface. */
export const liquidGlass = Platform.OS === "ios" && isLiquidGlassAvailable();
/** §9.7 Android: Material 3 Expressive chrome (floating toolbar, morphing FAB) drawn in-app; SDK 57 has no native M3 toolbar module. */
export const materialChrome = Platform.OS === "android";

interface BarProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onLayout?: (e: LayoutChangeEvent) => void;
  testID?: string;
}

/** A navigation-layer bar: Liquid Glass on iOS 26 (content scrolls beneath it), the page background elsewhere. */
export function ChromeBar({ children, style, onLayout, testID }: BarProps) {
  const { scheme } = useTheme();
  if (liquidGlass)
    return (
      <GlassView testID={testID} glassEffectStyle="regular" colorScheme={scheme} style={style} onLayout={onLayout}>
        {children}
      </GlassView>
    );
  return (
    <View testID={testID} style={style} onLayout={onLayout}>
      {children}
    </View>
  );
}

/** A header row: an M3 floating toolbar (detached pill, hairline, surface-1) on Android, in-flow everywhere else. */
export function FloatingToolbar({ children, style, testID }: Omit<BarProps, "onLayout">) {
  const { theme } = useTheme();
  if (materialChrome)
    return (
      <View testID={testID} style={[styles.floating, { backgroundColor: theme.surface1, borderColor: theme.border }, style]}>
        {children}
      </View>
    );
  return (
    <View testID={testID} style={style}>
      {children}
    </View>
  );
}

interface FabProps {
  icon: IconName;
  label: string;
  onPress: () => void;
  testID?: string;
  haptics?: boolean;
}

/** Android only: an extended FAB whose corners morph (16 → 28) on an expressive spring; the one bounce §9.4 allows besides the first seal. */
export function Fab({ icon, label, onPress, testID, haptics = true }: FabProps) {
  const { theme } = useTheme();
  const type = useType();
  const press = useRef(new Animated.Value(0)).current;
  const reduceMotion = useRef<boolean | null>(null);
  if (reduceMotion.current === null) {
    reduceMotion.current = false;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => (reduceMotion.current = !!v)).catch(() => undefined);
  }
  const morph = (to: number) => {
    if (reduceMotion.current) return press.setValue(to);
    Animated.spring(press, { toValue: to, damping: 12, stiffness: 320, mass: 0.8, useNativeDriver: false }).start();
  };
  const borderRadius = press.interpolate({ inputRange: [0, 1], outputRange: [radius.card + 2, 28] });
  const scale = press.interpolate({ inputRange: [0, 1], outputRange: [1, 0.94] });
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPressIn={() => morph(1)}
      onPressOut={() => morph(0)}
      onPress={() => {
        void haptic("tap", haptics);
        onPress();
      }}
      style={styles.fabWrap}
    >
      <Animated.View style={[styles.fab, { backgroundColor: theme.ctaFill, borderRadius, transform: [{ scale }] }]}>
        <Icon name={icon} size={22} color={theme.ctaText} />
        <Text style={[type.body, type.strong, { color: theme.ctaText }]}>{label}</Text>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  floating: { marginHorizontal: 12, marginTop: 4, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.pill, overflow: "hidden" },
  fabWrap: { position: "absolute", end: 16, bottom: 24 },
  fab: { minHeight: 56, paddingHorizontal: 20, flexDirection: "row", alignItems: "center", gap: 10 },
});
