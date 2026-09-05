import { Linking, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useLocalSearchParams } from "expo-router";
import { radius } from "@inborn/ui";
import { useTheme, FONT } from "../../services/theme";
import { Screen } from "../../components/shell/Screen";
import { Mono, Section, shellStyles } from "../../components/shell/primitives";

interface Licence {
  name: string;
  licence: string;
  url: string;
  note?: string;
}

/* §11.4: what ships built in or from our CDN makes us a distributor; every item carries name, licence, link, limits. */
const MODELS: Licence[] = [{ name: "Qwen3.5 0.8B (Instant)", licence: "Apache-2.0", url: "https://huggingface.co/Qwen", note: "NOTICE and attribution; no downstream use restrictions." }];

const OSS: Licence[] = [
  { name: "llama.cpp", licence: "MIT", url: "https://github.com/ggml-org/llama.cpp" },
  { name: "llama.rn", licence: "MIT", url: "https://github.com/mybigday/llama.rn" },
  { name: "wllama", licence: "MIT", url: "https://github.com/ngxson/wllama" },
  { name: "SQLCipher", licence: "BSD-3-Clause", url: "https://www.zetetic.net/sqlcipher/" },
  { name: "Expo, React Native", licence: "MIT", url: "https://expo.dev" },
  { name: "react-native-svg", licence: "MIT", url: "https://github.com/software-mansion/react-native-svg" },
  { name: "i18next, react-i18next, i18next-icu", licence: "MIT", url: "https://www.i18next.com" },
  { name: "IBM Plex Sans, IBM Plex Mono", licence: "OFL-1.1", url: "https://github.com/IBM/plex" },
];

export function Licenses() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const { oss } = useLocalSearchParams<{ oss?: string }>();
  const Item = ({ l }: { l: Licence }) => (
    <View style={[styles.item, { borderColor: theme.border, backgroundColor: theme.surface1 }]}>
      <Text style={[shellStyles.heading, { color: theme.text }]}>{l.name}</Text>
      <Mono color={theme.text2}>{l.licence}</Mono>
      {l.note ? <Text style={[shellStyles.bodySmall, { color: theme.text2 }]}>{l.note}</Text> : null}
      <Text accessibilityRole="link" onPress={() => void Linking.openURL(l.url)} style={[styles.link, { color: theme.accent }]}>
        {l.url}
      </Text>
    </View>
  );
  return (
    <Screen header={{ back: true, title: oss === "1" ? t("about.openSource") : t("about.modelLicenses") }} testID="licenses">
      {oss !== "1" ? (
        <Section title={t("about.modelLicenses")}>
          <Text style={[shellStyles.bodySmall, { color: theme.text2 }]}>{t("licenses.modelsNote")}</Text>
          {MODELS.map((l) => (
            <Item key={l.name} l={l} />
          ))}
        </Section>
      ) : null}
      <Section title={t("about.openSource")}>
        {OSS.map((l) => (
          <Item key={l.name} l={l} />
        ))}
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  item: { borderWidth: 1, borderRadius: radius.control, padding: 12, gap: 4, marginTop: 8 },
  link: { fontFamily: FONT.mono, fontSize: 12 },
});
