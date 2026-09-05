import { Text } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Screen } from "../components/shell/Screen";
import { Button, shellStyles } from "../components/shell/primitives";
import { useTheme } from "../services/theme";

export default function NotFound() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const router = useRouter();
  return (
    <Screen header={{ back: false }} testID="not-found">
      <Text style={[shellStyles.body, { color: theme.text2 }]}>{t("notFound")}</Text>
      <Button title={t("app.name")} onPress={() => router.replace("/")} />
    </Screen>
  );
}
