import { Linking, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { radius } from "@inborn/ui";
import { useTheme } from "../services/theme";
import { useType } from "../services/type";
import { Button, Mono } from "./shell/primitives";
import { legalHost, legalUrl, type LegalLink } from "../lib/legalLinks";

/**
 * The header every legal screen opens with: this build's copy is offline and frozen, the live page is the current one.
 * `Linking.openURL` hands the URL to the system browser, so it works on Android without the INTERNET permission (D3).
 */
export function LegalSource({ doc, label, testID = "legal-source" }: { doc: LegalLink; label: string; testID?: string }) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const type = useType();
  return (
    <View testID={testID} style={[styles.block, { borderColor: theme.border, backgroundColor: theme.surface1 }]}>
      <Mono testID={`${testID}-offline`} color={theme.text3}>
        {label}
      </Mono>
      <Button testID={`${testID}-open`} title={t("legal.readCurrent", { url: legalHost(doc) })} onPress={() => void Linking.openURL(legalUrl(doc))} />
      <Text style={[type.bodySmall, { color: theme.text2 }]}>{t("legal.currentNote")}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { marginTop: 8, padding: 12, borderWidth: 1, borderRadius: radius.card, gap: 10 },
});
