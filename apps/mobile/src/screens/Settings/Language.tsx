import { useTranslation } from "react-i18next";
import { useLocalSearchParams, useRouter } from "expo-router";
import { LAUNCH_LOCALES, i18next } from "@inborn/i18n";
import { useAppServices } from "../../services/AppServices";
import { Screen } from "../../components/shell/Screen";
import { Row } from "../../components/shell/primitives";
import { languageName } from "./Settings";

const ANSWER_LOCALES = ["en", "ja", "de", "fr", "es", "pt-BR", "it", "ko", "zh-Hant", "zh-Hans", "ru", "ar", "he", "hi", "tr", "pl", "vi", "id"];

/** UI language from the launch locales (§7.8 D13, pseudo in dev builds); the answer hint is a separate list. */
export function Language() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { answer } = useLocalSearchParams<{ answer?: string }>();
  const { prefs, updatePrefs } = useAppServices();
  const forAnswer = answer === "1";
  const list = forAnswer ? ANSWER_LOCALES : [...LAUNCH_LOCALES, ...(__DEV__ ? ["pseudo"] : [])];
  const current = forAnswer ? (prefs.answerLanguage ?? "") : i18n.language;
  const choose = (tag: string) => {
    if (forAnswer) updatePrefs({ answerLanguage: tag || null });
    else {
      updatePrefs({ locale: tag });
      void i18next.changeLanguage(tag);
    }
    router.back();
  };
  return (
    <Screen header={{ back: true, title: forAnswer ? t("settings.language.answer") : t("settings.language.ui") }} testID="language">
      {forAnswer ? <Row label={t("settings.language.followsUi")} value={current === "" ? "✓" : undefined} onPress={() => choose("")} /> : null}
      {list.map((tag) => (
        <Row key={tag} testID={`lang-${tag}`} label={languageName(tag)} sub={tag} value={tag === current ? "✓" : undefined} onPress={() => choose(tag)} />
      ))}
    </Screen>
  );
}
