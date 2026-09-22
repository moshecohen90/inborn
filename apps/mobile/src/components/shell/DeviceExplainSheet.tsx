import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { TIER_NAMES } from "@inborn/core";
import { Sheet } from "../chat/Sheet";
import { useTheme } from "../../lib/theme";
import { useType } from "../../services/type";
import { useDeviceGuardState } from "../../device/useDeviceState";
import { shape } from "../chat/styles";

/**
 * §8.8 row 4c: the first time the battery rule swaps the model by itself, say so once. Every later switch is the
 * status line alone. "Don't switch automatically" is S52 › Performance's own setting, offered where it is earned.
 */
export function DeviceExplainSheet() {
  const { t } = useTranslation();
  const theme = useTheme();
  const type = useType();
  const guard = useDeviceGuardState();
  const explain = guard?.explain ?? null;
  const close = () => guard?.ackExplain();
  return (
    <Sheet visible={!!explain} onClose={close} testID="device-explain-sheet" scroll={false} title={t("device.sheet.title", { model: TIER_NAMES[explain?.to ?? "instant"] })}>
      <Text style={[type.body, styles.body, { color: theme.text2 }]}>{t("device.sheet.body", { previous: TIER_NAMES[explain?.from ?? "fast"] })}</Text>
      <View style={styles.actions}>
        <Pressable
          testID="device-explain-never"
          accessibilityRole="button"
          onPress={() => {
            guard?.setOverride({ neverSwitchModel: true });
            close();
          }}
          style={styles.textBtn}
        >
          <Text style={[type.body, { color: theme.text2 }]}>{t("device.sheet.dontSwitch")}</Text>
        </Pressable>
        <Pressable testID="device-explain-ok" accessibilityRole="button" onPress={close} style={[shape.control, styles.cta, { backgroundColor: theme.ctaFill }]}>
          <Text style={[type.body, type.strong, { color: theme.ctaText }]}>{t("device.sheet.ok")}</Text>
        </Pressable>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { marginBottom: 20 },
  actions: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 12 },
  textBtn: { minHeight: 44, justifyContent: "center", paddingHorizontal: 8 },
  cta: { minHeight: 44, justifyContent: "center", paddingHorizontal: 20 },
});
