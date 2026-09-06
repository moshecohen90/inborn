import { useMemo } from "react";
import { Platform, StyleSheet, Switch, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { formatBytes } from "@inborn/core";

import { useTheme, FONT } from "../../services/theme";
import { useAppServices } from "../../services/AppServices";
import { Screen } from "../../components/shell/Screen";
import { Button, MonoLabel, shellStyles } from "../../components/shell/primitives";
import { ChipGlyph } from "../../components/shell/ChipGlyph";
import { modelFileSize } from "./modelSize";

/** S02: the app already knows what fits; chat starts now with the built-in model, a bigger one is an offer, not a gate. */
export function ModelChoice() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const router = useRouter();
  const { engine, prefs, updatePrefs } = useAppServices();
  const size = useMemo(() => modelFileSize(engine.model.uri), [engine.model.uri]);
  const ready = engine.model.id !== "null";
  const next = () => router.push("/onboarding/airplane");
  return (
    <Screen header={{ back: true }} mesh testID="onboarding-model" footer={<Footer ready={ready} onStart={next} onInstantOnly={next} />}>
      <Text accessibilityRole="header" style={[shellStyles.title, { color: theme.text }]}>
        {t("onboarding.model.title")}
      </Text>
      <View testID="model-ready-card" style={[shellStyles.card, { borderColor: theme.sealed, backgroundColor: theme.surface1 }]}>
        <MonoLabel color={theme.sealed}>{t("onboarding.model.readyNow")}</MonoLabel>
        <View style={styles.nameRow}>
          <ChipGlyph size={16} color={theme.text} />
          <Text style={[shellStyles.heading, { color: theme.text }]}>{ready ? t("onboarding.model.instant") : t("onboarding.model.none")}</Text>
        </View>
        <Text style={[shellStyles.bodySmall, { color: theme.text2 }]}>
          {ready ? t("onboarding.model.instantLine", { size: size ? formatBytes(size) : "0.5 GB" }) : t("onboarding.model.noneLine")}
        </Text>
      </View>
      <View testID="model-offer-card" style={[shellStyles.card, { borderColor: theme.border, backgroundColor: theme.surface1 }]}>
        <MonoLabel>{t("onboarding.model.offer")}</MonoLabel>
        <Text style={[shellStyles.heading, { color: theme.text }]}>{t("onboarding.model.fast")}</Text>
        <Text style={[shellStyles.bodySmall, { color: theme.text2 }]}>{t("onboarding.model.fastLine")}</Text>
        {Platform.OS === "android" ? <Text style={[shellStyles.bodySmall, { color: theme.text2 }]}>{t("onboarding.model.playLine")}</Text> : null}
        <View style={styles.switchRow}>
          <Text style={[shellStyles.bodySmall, styles.grow, { color: theme.text }]}>{t("settings.downloads.wifiOnly")}</Text>
          <Switch value={prefs.wifiOnly} onValueChange={(v) => updatePrefs({ wifiOnly: v })} trackColor={{ true: theme.sealed }} />
        </View>
        <Text style={[styles.note, { color: theme.text3 }]}>{t("onboarding.model.laterInVault")}</Text>
      </View>
    </Screen>
  );
}

function Footer({ ready, onStart, onInstantOnly }: { ready: boolean; onStart: () => void; onInstantOnly: () => void }) {
  const { t } = useTranslation();
  return (
    <>
      <Button testID="start-chatting" title={t("onboarding.model.start")} onPress={onStart} disabled={!ready} />
      <Button title={t("onboarding.model.instantOnly")} variant="link" onPress={onInstantOnly} />
    </>
  );
}

const styles = StyleSheet.create({
  nameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  switchRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingTop: 4 },
  grow: { flex: 1 },
  note: { fontFamily: FONT.sans, fontSize: 12, lineHeight: 16 },
});
