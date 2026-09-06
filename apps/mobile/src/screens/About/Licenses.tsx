import { Linking, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useLocalSearchParams } from "expo-router";
import { radius } from "@inborn/ui";
import { useTheme, FONT } from "../../services/theme";
import { Screen } from "../../components/shell/Screen";
import { Mono, Section, shellStyles } from "../../components/shell/primitives";
import notice from "../../../../../docs/legal/NOTICE.json";

interface Component {
  id: string;
  group: "model" | "engine" | "library" | "font";
  name: string;
  version?: string;
  tier?: string;
  license: string;
  licenseUrl?: string;
  homepage?: string;
  attribution?: string;
  obligations?: string[];
  restrictions?: string[];
  /** shipped / catalogue / planned / build-only (docs/legal/NOTICE.json). */
  scope: string;
}

const COMPONENTS = (notice as { components: Component[] }).components;
/* §11.4: what ships built in or from our CDN makes us a distributor; planned and build-only entries are an audit trail, not a notice. */
const shipping = (c: Component) => /^(shipped|catalogue)/.test(c.scope);
const GROUPS: Component["group"][] = ["engine", "library", "font"];

export function Licenses() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const { oss } = useLocalSearchParams<{ oss?: string }>();
  const Item = ({ c }: { c: Component }) => (
    <View testID={`licence-${c.id}`} style={[styles.item, { borderColor: theme.border, backgroundColor: theme.surface1 }]}>
      <Text style={[shellStyles.heading, { color: theme.text }]}>
        {c.name}
        {c.tier ? ` · ${c.tier}` : ""}
      </Text>
      <Mono color={theme.text2}>{[c.license, c.version, c.scope.toUpperCase()].filter(Boolean).join(" · ")}</Mono>
      {c.attribution ? <Text style={[shellStyles.bodySmall, { color: theme.text2 }]}>{c.attribution}</Text> : null}
      {c.restrictions?.length ? <Text style={[shellStyles.bodySmall, { color: theme.text2 }]}>{c.restrictions.join(" ")}</Text> : null}
      {c.homepage || c.licenseUrl ? (
        <Text accessibilityRole="link" onPress={() => void Linking.openURL(c.homepage ?? c.licenseUrl!)} style={[styles.link, { color: theme.accent }]}>
          {c.homepage ?? c.licenseUrl}
        </Text>
      ) : null}
    </View>
  );
  return (
    <Screen header={{ back: true, title: oss === "1" ? t("about.openSource") : t("about.modelLicenses") }} testID="licenses">
      {oss !== "1" ? (
        <Section title={t("about.modelLicenses")}>
          <Text style={[shellStyles.bodySmall, { color: theme.text2 }]}>{t("licenses.modelsNote")}</Text>
          {COMPONENTS.filter((c) => c.group === "model" && shipping(c)).map((c) => (
            <Item key={c.id} c={c} />
          ))}
        </Section>
      ) : null}
      {GROUPS.map((g) => (
        <Section key={g} title={t(`licenses.group.${g}`)}>
          {COMPONENTS.filter((c) => c.group === g && shipping(c)).map((c) => (
            <Item key={c.id} c={c} />
          ))}
        </Section>
      ))}
      <Text style={[shellStyles.caption, styles.foot, { color: theme.text3 }]}>{t("licenses.source", { date: (notice as { generated: string }).generated })}</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  item: { borderWidth: 1, borderRadius: radius.control, padding: 12, gap: 4, marginTop: 8 },
  link: { fontFamily: FONT.mono, fontSize: 12 },
  foot: { paddingTop: 16, textAlign: "center" },
});
