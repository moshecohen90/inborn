import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";

import { useTheme, FONT } from "../../services/theme";
import { Screen } from "../../components/shell/Screen";
import { Seal } from "../../components/Seal";
import { Button, MonoLabel, shellStyles } from "../../components/shell/primitives";
import { ChipGlyph } from "../../components/shell/ChipGlyph";
import { deviceLine } from "./deviceLine";

/** S01: the thesis in one sentence and the open seal before anything else. No skip: the next screen is already useful. */
export function Welcome() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const router = useRouter();
  const line = useMemo(deviceLine, []);
  return (
    <Screen header={null} mesh testID="onboarding-welcome" footer={<Footer onNext={() => router.push("/onboarding/model")} />}>
      <View style={styles.hero}>
        <Seal size={72} state="open" label={t("onboarding.sealOpen")} />
        <Text accessibilityRole="header" style={[shellStyles.headline, styles.center, { color: theme.text }]}>
          {t("onboarding.headline")}
        </Text>
        <Text style={[shellStyles.body, styles.center, { color: theme.text2 }]}>{t("onboarding.sub")}</Text>
        <View style={[styles.runsOn, { borderColor: theme.border, backgroundColor: theme.surface1 }]}>
          <ChipGlyph size={14} color={theme.text2} />
          <MonoLabel color={theme.text2} testID="runs-on">
            {line.ram ? t("onboarding.runsOn", { chip: line.chip, ram: line.ram }) : t("onboarding.runsOnNoRam", { chip: line.chip })}
          </MonoLabel>
        </View>
        {line.slow ? <Text style={[shellStyles.bodySmall, styles.center, { color: theme.text3 }]}>{t("onboarding.slowDevice")}</Text> : null}
      </View>
    </Screen>
  );
}

function Footer({ onNext }: { onNext: () => void }) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  return (
    <>
      <Button testID="onboarding-continue" title={t("onboarding.continue")} onPress={onNext} />
      <Text style={[styles.disclaimer, { color: theme.text3 }]}>{t("onboarding.disclaimer")}</Text>
    </>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: "center", gap: 20, paddingTop: 48, paddingHorizontal: 8 },
  center: { textAlign: "center" },
  runsOn: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 36, paddingHorizontal: 12, borderWidth: 1, borderRadius: 999 },
  disclaimer: { fontFamily: FONT.mono, fontSize: 10, letterSpacing: 0.5, textAlign: "center", paddingTop: 4 },
});
