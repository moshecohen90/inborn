import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import type { CrisisResource } from "@inborn/core";
import { useTheme } from "../../lib/theme";
import { shape, type } from "./styles";

/** Resources card above the answer when crisis language is detected (§8.2 S14). Never blocks the chat; dismissible. */
export function SafetyCard({ resources, onDismiss }: { resources: CrisisResource[]; onDismiss: () => void }) {
  const theme = useTheme();
  const { t } = useTranslation();
  return (
    <View testID="safety-card" style={[shape.card, styles.card, { backgroundColor: theme.surface1, borderColor: theme.accent }]} accessibilityLiveRegion="polite">
      <Text style={[type.heading, { color: theme.text }]}>{t("safety.title")}</Text>
      {resources.map((r) => (
        // The dialer is the only thing this opens: a tel: intent handled by the OS, no data leaves the app.
        <Pressable key={r.phone} accessibilityRole="button" onPress={() => void Linking.openURL(`tel:${r.phone}`).catch(() => undefined)} style={styles.line}>
          <Text style={[type.body, { color: theme.text }]}>{r.name}</Text>
          <Text style={[type.body, type.strong, { color: theme.accent }]}>{r.phone}</Text>
        </Pressable>
      ))}
      <Pressable testID="safety-dismiss" accessibilityRole="button" onPress={onDismiss} style={styles.dismiss}>
        <Text style={[type.caption, { color: theme.text2 }]}>{t("safety.dismiss")}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 8 },
  line: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12, minHeight: 36, flexWrap: "wrap" },
  dismiss: { alignSelf: "flex-end", minHeight: 32, justifyContent: "center" },
});
