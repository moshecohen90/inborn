import { Pressable, Text } from "react-native";
import { useTranslation } from "react-i18next";
import { router } from "expo-router";
import { useTheme } from "../lib/theme";
import { shape } from "../components/chat/styles";
import { useType } from "../services/type";

/** "WORK" chip next to a Work-gated action (the Work twin of ProTag); tapping opens S60. */
export function WorkTag({ onPress }: { onPress?: () => void } = {}) {
  const type = useType();
  const theme = useTheme();
  const { t } = useTranslation();
  return (
    <Pressable testID="work-tag" accessibilityRole="button" accessibilityLabel={t("work.unlock")} hitSlop={8} onPress={onPress ?? (() => router.push("/paywall"))} style={[shape.chip, { borderColor: theme.accent, minHeight: 22 }]}>
      <Text style={[type.monoLabel, { color: theme.accent }]}>{t("work.tag")}</Text>
    </Pressable>
  );
}
