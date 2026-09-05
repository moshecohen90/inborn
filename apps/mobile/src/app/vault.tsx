import { Text } from "react-native";
import { useTranslation } from "react-i18next";
import { Screen } from "../components/shell/Screen";
import { shellStyles } from "../components/shell/primitives";
import { useTheme } from "../services/theme";

/** S30 placeholder: the vault stream replaces this file with its VaultScreen. */
export default function VaultRoute() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  return (
    <Screen header={{ back: true, title: t("vault.title") }} mesh testID="vault">
      <Text style={[shellStyles.body, { color: theme.text2 }]}>{t("placeholder.comingSoon")}</Text>
    </Screen>
  );
}
