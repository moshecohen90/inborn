import { StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import type { Theme } from "@inborn/ui";
import { LANGUAGE_NAME_BY_CODE, LANGUAGE_TIERS, USE_CASES, USE_TIERS, type LanguageTier, type ModelFit, type UseTier } from "@inborn/core";
import { useType } from "../../services/type";

export interface FitMapProps {
  fit: ModelFit;
  theme: Theme;
  testID?: string;
}

/** §6.1 fit map on the cartridge: what the model is good at, in which languages, and what it is weak at, one tier per line. */
export function FitMap({ fit, theme, testID }: FitMapProps) {
  const type = useType();
  const { t } = useTranslation();
  const useRows = USE_TIERS.map((tier) => [tier, USE_CASES.filter((u) => fit.uses[u] === tier).map((u) => t(`use.${u}`))] as const).filter(([, names]) => names.length);
  /* A script variant that agrees with its plain language ("zh-Hant" native next to "zh" native) says nothing new on the cartridge. */
  const codes = Object.keys(fit.languages).filter((c) => !c.includes("-") || fit.languages[c] !== fit.languages[c.split("-")[0]!]);
  const langRows = LANGUAGE_TIERS.map((tier) => [tier, codes.filter((c) => fit.languages[c] === tier).map((c) => t(`language.${c}`, { defaultValue: LANGUAGE_NAME_BY_CODE[c] ?? c }))] as const).filter(([, names]) => names.length);
  const colorOf = (tier: UseTier | LanguageTier): string => (tier === "best" || tier === "native" ? theme.sealed : tier === "good" ? theme.text : tier === "none" ? theme.danger : theme.text3);
  return (
    <View testID={testID} style={styles.map}>
      <Text style={[type.monoLabel, { color: theme.text3 }]}>{t("vault.fit.uses").toUpperCase()}</Text>
      {useRows.map(([tier, names]) => (
        <Text key={tier} style={[type.mono, { color: theme.text2 }]}>
          <Text style={{ color: colorOf(tier) }}>{t(`vault.fit.tier.${tier}`)}</Text> · {names.join(", ")}
        </Text>
      ))}
      <Text style={[type.monoLabel, styles.gap, { color: theme.text3 }]}>{t("vault.fit.languages").toUpperCase()}</Text>
      {langRows.map(([tier, names]) => (
        <Text key={tier} style={[type.mono, { color: theme.text2 }]}>
          <Text style={{ color: colorOf(tier) }}>{t(`vault.fit.tier.${tier}`)}</Text> · {names.join(", ")}
        </Text>
      ))}
      <Text style={[type.mono, styles.gap, { color: theme.text2 }]}>{t("vault.fit.weakAt", { text: fit.weakAt })}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  map: { gap: 2, marginTop: 2 },
  gap: { marginTop: 4 },
});
