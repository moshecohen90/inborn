import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";

import { useTheme } from "../../services/theme";
import { useDeviceState } from "../../device/useDeviceState";
import { useAppServices } from "../../services/AppServices";
import { useStorageFull } from "../../services/storageFull";
import { dismissRepair, useRepairOutcome } from "../../storage/repairNotice";
import { Mono } from "./primitives";
import { emitShortcut } from "../../lib/shortcuts";
import { ownsPausedTurn, usePausedTurn } from "../../lib/pausedTurn";
import { font } from "../../services/type";
import { bannerRows } from "./bannerRows";

/** §8.8 system-wide states as one strip under the header. Policy comes from useDeviceState(); this is only how it looks. */
export function Banners() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const router = useRouter();
  const device = useDeviceState();
  const storageFull = useStorageFull();
  const repair = useRepairOutcome();
  const { active, delivery, switchToInstant, switchBack, continueGeneration } = useAppServices();
  /* The guard's paused flag is app-wide; the partial answer it kept belongs to one chat (QA F28). */
  const pausedHere = ownsPausedTurn(usePausedTurn(), active.id);
  const rows = bannerRows(
    { device, storageFull, repair, pausedHere, delivery },
    {
      dismissRepair,
      manageStorage: () => router.push("/settings/storage"),
      switchToInstant,
      switchBack,
      continueGeneration,
      continuePaused: () => {
        continueGeneration();
        emitShortcut("continue");
      },
    },
    t,
  );

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
