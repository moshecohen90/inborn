import { Linking, Platform, StyleSheet, Text } from "react-native";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import Constants from "expo-constants";
import * as Application from "expo-application";
import * as Device from "expo-device";
import { useTheme } from "../../services/theme";
import { useAppServices } from "../../services/AppServices";
import { Screen } from "../../components/shell/Screen";
import { Row, Section } from "../../components/shell/primitives";
import { useType } from "../../services/type";

const SUPPORT = "support@inbornapp.com";

/** About (S52): version + hash, licences, privacy policy, a diagnostics mail without chat content, "What's missing?". */
export function About() {
  const type = useType();
  const { t } = useTranslation();
  const { theme } = useTheme();
  const router = useRouter();
  const { engine, storageKind } = useAppServices();
  const version = Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? "0.0.1";
  const build = Application.nativeBuildVersion ?? "web";
  const extra = (Constants.expoConfig?.extra ?? {}) as { commit?: string };

  // Diagnostics carry the device and engine, never a chat (spec §10.9 #59).
  const diagnostics = [
    `Inborn ${version} (${build}) ${extra.commit ?? ""}`,
    `${Platform.OS} ${Device.osVersion ?? ""} · ${Device.modelName ?? ""}`,
    `engine ${engine.engine.id} · model ${engine.model.id} · storage ${storageKind}`,
  ].join("\n");
  const mail = (subject: string, body: string) => void Linking.openURL(`mailto:${SUPPORT}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`);

  return (
    <Screen header={{ back: true, title: t("about.title") }} testID="about">
      <Section title={t("about.version")}>
        <Row label={`${version} (${build})`} value={extra.commit ?? ""} />
      </Section>
      <Section title={t("about.licenses")}>
        <Row label={t("about.modelLicenses")} onPress={() => router.push("/settings/licenses")} chevron />
        <Row label={t("about.openSource")} onPress={() => router.push("/settings/licenses?oss=1")} chevron />
      </Section>
      <Section title={t("about.privacy")}>
        <Text style={[type.bodySmall, { color: theme.text2 }]}>{t("settings.privacy")}</Text>
        <Row testID="row-privacy" label={t("legal.privacy")} onPress={() => router.push("/legal/privacy")} chevron />
        <Row testID="row-terms" label={t("legal.terms")} onPress={() => router.push("/legal/terms")} chevron />
      </Section>
      <Section title={t("about.help")}>
        <Row label={t("about.report")} sub={t("about.reportSub")} onPress={() => mail("Inborn: problem report", `${diagnostics}\n\n`)} chevron />
        <Row label={t("about.missing")} onPress={() => mail("Inborn: what's missing?", "")} chevron />
      </Section>
      <Text style={[styles.foot, type.caption, { color: theme.text3 }]}>{t("about.footer")}</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({ foot: { paddingTop: 24, textAlign: "center" } });
