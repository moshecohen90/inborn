import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";

import { useTheme } from "../../services/theme";
import { useType } from "../../services/type";
import { Screen } from "../../components/shell/Screen";
import { Seal } from "../../components/Seal";
import { Button, MonoLabel } from "../../components/shell/primitives";
import { ChipGlyph } from "../../components/shell/ChipGlyph";
import { deviceLine } from "./deviceLine";
import { deviceNoun } from "../../lib/deviceNoun";
import { useWide } from "../../lib/useLayout";

/** S01: the thesis in one sentence and the open seal before anything else. No skip: the next screen is already useful. */
export function Welcome() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const type = useType();
  const router = useRouter();
  const line = useMemo(deviceLine, []);
  const wide = useWide();
  return (
    <Screen header={null} mesh card testID="onboarding-welcome" footer={<Footer onNext={() => router.push("/onboarding/model")} />}>
      <View style={[styles.hero, wide ? styles.heroOnCard : null]}>
        <Seal size={72} state="open" label={t("onboarding.sealOpen")} />
        <Text accessibilityRole="header" style={[type.headline, styles.center, { color: theme.text }]}>
          {t("onboarding.headline", { device: deviceNoun() })}
        </Text>
        <Text style={[type.body, styles.center, { color: theme.text2 }]}>{t("onboarding.sub")}</Text>
        <View style={[styles.runsOn, { borderColor: theme.border, backgroundColor: theme.surface1 }]}>
          <ChipGlyph size={14} color={theme.text2} />
          <MonoLabel color={theme.text2} testID="runs-on">
            {line.ram ? t("onboarding.runsOn", { chip: line.chip, ram: line.ram }) : t("onboarding.runsOnNoRam", { chip: line.chip })}
          </MonoLabel>
        </View>
        {line.slow ? <Text style={[type.bodySmall, styles.center, { color: theme.text3 }]}>{t("onboarding.slowDevice", { device: deviceNoun() })}</Text> : null}
      </View>
    </Screen>
  );
}

function Footer({ onNext }: { onNext: () => void }) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const type = useType();
  return (
    <>
      <Button testID="onboarding-continue" title={t("onboarding.continue")} onPress={onNext} />
      {/* §9.3: the smallest step is the caption; the AI notice is never below it. */}
      <Text style={[type.caption, styles.disclaimer, { color: theme.text3 }]}>{t("onboarding.disclaimer")}</Text>
    </>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: "center", gap: 20, paddingTop: 48, paddingHorizontal: 8 },
  /* The card supplies the breathing room on a wide window; the phone's top padding would push the hero off centre. */
  heroOnCard: { paddingTop: 0 },
  center: { textAlign: "center" },
  runsOn: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 36, paddingHorizontal: 12, borderWidth: 1, borderRadius: 999 },
  disclaimer: { textAlign: "center", paddingTop: 4, paddingHorizontal: 8 },
});
