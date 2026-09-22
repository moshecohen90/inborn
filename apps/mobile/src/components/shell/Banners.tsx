import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { formatBytes } from "@inborn/core";

import { useTheme } from "../../services/theme";
import { useDeviceState } from "../../device/useDeviceState";
import { useAppServices } from "../../services/AppServices";
import { useStorageFull } from "../../services/storageFull";
import { Mono } from "./primitives";
import { emitShortcut } from "../../lib/shortcuts";
import { ownsPausedTurn, usePausedTurn } from "../../lib/pausedTurn";
import { font } from "../../services/type";

/** §8.8 system-wide states as one strip under the header. Policy comes from useDeviceState(); this is only how it looks. */
export function Banners() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const router = useRouter();
  const device = useDeviceState();
  const storageFull = useStorageFull();
  const { active, delivery, switchToInstant, switchBack, continueGeneration } = useAppServices();
  /* The guard's paused flag is app-wide; the partial answer it kept belongs to one chat (QA F28). */
  const pausedHere = ownsPausedTurn(usePausedTurn(), active.id);
  const rows: { key: string; tone: "amber" | "danger" | "muted"; text: string; action?: { label: string; onPress: () => void }; icon?: string }[] = [];

  const rec = device.recommendation;
  if (rec.kind === "storageFull" || storageFull)
    rows.push({ key: "storage", tone: "amber", icon: "▲", text: t("state.storageFull"), action: { label: t("state.manageStorage"), onPress: () => router.push("/settings/storage") } });
  if (device.thermal === "critical" || (rec.kind === "pause" && rec.reason === "thermal"))
    rows.push({ key: "thermal-critical", tone: "danger", text: t("state.thermalCritical"), action: { label: t("state.continue"), onPress: continueGeneration } });
  else if (device.thermal === "serious") rows.push({ key: "thermal", tone: "amber", text: t("state.thermalSerious"), action: { label: t("state.switchToInstant"), onPress: switchToInstant } });
  if (rec.kind === "pause" && rec.reason === "memory") rows.push({ key: "memory", tone: "danger", text: t("state.memoryStopped"), action: { label: t("state.continue"), onPress: continueGeneration } });
  if (rec.kind === "paused" && pausedHere)
    rows.push({
      key: "paused",
      tone: "muted",
      text: t("state.pausedInBackground"),
      action: {
        label: t("state.continue"),
        onPress: () => {
          continueGeneration();
          emitShortcut("continue");
        },
      },
    });
  if (rec.kind === "switchToInstant" && rec.auto && rec.reason === "fit") rows.push({ key: "memory", tone: "muted", text: t("state.fitSwitched"), action: { label: t("state.switchBack"), onPress: switchBack } });
  else if (rec.kind === "switchToInstant" && rec.auto && rec.reason === "memory") rows.push({ key: "memory", tone: "amber", text: t("state.memorySwitched"), action: { label: t("state.switchBack"), onPress: switchBack } });
  else if (rec.kind === "switchToInstant" && rec.auto)
    rows.push({ key: "lowpower", tone: "muted", text: t("state.lowPowerSwitched"), action: { label: t("state.switchBack"), onPress: switchBack } });
  else if (rec.kind === "switchToInstant" && rec.reason === "battery" && device.battery.level !== null)
    rows.push({ key: "battery", tone: "muted", text: t("state.batteryOffer", { pct: Math.round(device.battery.level * 100) }), action: { label: t("state.switch"), onPress: switchToInstant } });
  if (delivery && delivery.status === "delivering")
    rows.push({ key: "delivery", tone: "muted", text: t("state.delivering", { name: delivery.name, pct: Math.round(delivery.progress * 100), size: formatBytes(delivery.totalBytes) }) });
  else if (delivery && delivery.status === "verifying") rows.push({ key: "delivery", tone: "muted", text: t("state.verifying", { name: delivery.name, size: formatBytes(delivery.totalBytes) }) });

  if (rows.length === 0) return null;
  return (
    <View testID="banners">
      {rows.map((r) => {
        const color = r.tone === "danger" ? theme.danger : r.tone === "amber" ? theme.accent : theme.text2;
        return (
          <View key={r.key} testID={`banner-${r.key}`} style={[styles.row, { borderBottomColor: theme.border, backgroundColor: theme.surface1 }]}>
            {r.icon ? <Text style={[styles.icon, { color }]}>{r.icon}</Text> : null}
            <Text style={[styles.text, { color: r.tone === "muted" ? theme.text2 : theme.text }]}>{r.text}</Text>
            {r.action ? (
              <Pressable accessibilityRole="button" onPress={r.action.onPress} hitSlop={8} style={styles.action}>
                <Mono color={color}>{r.action.label.toUpperCase()}</Mono>
              </Pressable>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 40, paddingHorizontal: 16, paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth },
  icon: { fontSize: 12 },
  text: { flex: 1, ...font("sans"), fontSize: 14, lineHeight: 18 },
  action: { minHeight: 32, justifyContent: "center" },
});
