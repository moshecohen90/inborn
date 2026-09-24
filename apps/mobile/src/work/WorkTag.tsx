import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import type { PaywallReason } from "@inborn/core";
import { MIN_TOUCH } from "@inborn/ui";
import { openPaywall } from "../licence/openPaywall";
import { useTheme } from "../lib/theme";
import { shape } from "../components/chat/styles";
import { useType } from "../services/type";

/** "WORK" chip next to a Work-gated action (the Work twin of ProTag); tapping opens S60. */
/** A chip either runs its own handler or names its reason; a bare chip opened the paywall with no reason line. */
export type TagProps = { onPress: () => void; reason?: never } | { reason: PaywallReason; onPress?: never };

export function WorkTag({ onPress, reason }: TagProps) {
  const type = useType();
  const theme = useTheme();
  const { t } = useTranslation();
  /* Called with no arguments, like ProTag: Pressable would otherwise hand the press event to the handler (F292). */
  return (
    <Pressable testID="work-tag" accessibilityRole="button" accessibilityLabel={t("work.unlock")} onPress={() => (onPress ? onPress() : openPaywall(reason))} style={styles.target}>
      <View style={[shape.chip, { borderColor: theme.accent, minHeight: 22 }]}>
        <Text style={[type.monoLabel, { color: theme.accent }]}>{t("work.tag")}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({ target: { minHeight: MIN_TOUCH, justifyContent: "center" } });
