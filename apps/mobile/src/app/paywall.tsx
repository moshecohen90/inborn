import { StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useTheme } from "../services/theme";
import { Screen } from "../components/shell/Screen";
import { Button, MonoLabel, shellStyles } from "../components/shell/primitives";

/** S60 placeholder: copy and layout only; StoreKit / Play Billing arrive in M6. */
export default function PaywallRoute() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  return (
    <Screen header={{ back: true }} testID="paywall" footer={<Button title={t("paywall.unlockPro", { price: "$19.99" })} onPress={() => undefined} disabled />}>
      <Text accessibilityRole="header" style={[shellStyles.headline, { color: theme.text }]}>
        {t("paywall.title")}
      </Text>
      <Text style={[shellStyles.body, { color: theme.text2 }]}>{t("paywall.sub")}</Text>
      <View style={[shellStyles.card, styles.card, { borderColor: theme.border, backgroundColor: theme.surface1 }]}>
        <MonoLabel color={theme.text}>PRO · $19.99 · {t("paywall.oneTime")}</MonoLabel>
        <Text style={[shellStyles.bodySmall, { color: theme.text2 }]}>{t("paywall.features")}</Text>
      </View>
      <Text style={[shellStyles.caption, { color: theme.text3 }]}>{t("paywall.privacyNote")}</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({ card: { marginTop: 8 } });
