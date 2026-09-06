import { Text } from "react-native";
import { useTranslation } from "react-i18next";
import { Screen } from "../components/shell/Screen";
import { shellStyles } from "../components/shell/primitives";
import { useTheme } from "../services/theme";

/** S40 placeholder (M5). */
export default function DocumentsRoute() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  return (
    <Screen header={{ back: true, title: t("documents.title") }} testID="documents">
      <Text style={[shellStyles.body, { color: theme.text2 }]}>{t("placeholder.comingSoon")}</Text>
    </Screen>
  );
}
