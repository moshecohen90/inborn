import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../services/theme";
import { useTranslation } from "react-i18next";
import { radius } from "@inborn/ui";
import { requiredTier, type Feature } from "@inborn/core";
import { useEntitlement } from "./hooks";
import { font } from "../services/type";

export interface GateProps {
  feature: Feature;
  children: ReactNode;
  /** Shown instead of `children` when locked; default is a small "Pro feature · See Pro" row (spec §12.3: value moments, never a popup). */
  fallback?: ReactNode;
  /** Opens the paywall (S60). */
  onUnlock?: () => void;
}

/** `<Gate feature="documents" onUnlock={openPaywall}>…</Gate>`: children render only when the tier allows the feature. */
export function Gate({ feature, children, fallback, onUnlock }: GateProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const { can } = useEntitlement();
  if (can(feature)) return <>{children}</>;
  if (fallback !== undefined) return <>{fallback}</>;
  const tier = requiredTier(feature);
  return (
    <View testID={`gate-${feature}`} style={[styles.row, { borderColor: theme.border, backgroundColor: theme.surface1 }]}>
      <Text style={[styles.label, { color: theme.accent }]}>{t(tier === "work" ? "gate.locked.work" : "gate.locked.pro")}</Text>
      {onUnlock ? (
        <Pressable accessibilityRole="button" onPress={onUnlock} hitSlop={8}>
          <Text style={[styles.link, { color: theme.text }]}>{t(tier === "work" ? "gate.unlockWork" : "gate.unlock")}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, borderWidth: 1, borderRadius: radius.control, paddingHorizontal: 12, paddingVertical: 8 },
  label: { ...font("mono"), fontSize: 11, letterSpacing: 1 },
  link: { ...font("sans", "500"), fontSize: 14 },
});
