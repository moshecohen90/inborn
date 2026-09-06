import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../services/theme";
import { Screen } from "../../components/shell/Screen";
import { Mono } from "../../components/shell/primitives";
import { Markdown } from "../../components/chat/Markdown";
import privacy from "../../../../../docs/legal/privacy-policy.md";
import terms from "../../../../../docs/legal/terms.md";

export type LegalDoc = "privacy" | "terms";
const DOCS: Record<LegalDoc, string> = { privacy, terms };
export const isLegalDoc = (d: string | undefined): d is LegalDoc => d === "privacy" || d === "terms";

/* The repo copies open with a status block for the lawyer and the store reviewer; the reader gets the text from its first heading. */
export function legalBody(source: string): string {
  const lines = source.split("\n");
  const first = lines.findIndex((l) => /^##\s/.test(l));
  return (first > 0 ? lines.slice(first) : lines).join("\n").trim();
}

/** Privacy policy / terms (§11): the same Markdown the stores and the website show, rendered on the device. */
export function Legal({ doc }: { doc: LegalDoc }) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const body = useMemo(() => legalBody(DOCS[doc]), [doc]);
  const edited = /Last edited ([^.\n]+)/.exec(DOCS[doc])?.[1];
  return (
    <Screen header={{ back: true, title: t(doc === "privacy" ? "legal.privacy" : "legal.terms") }} testID={`legal-${doc}`}>
      {edited ? <Mono color={theme.text3}>{t("legal.edited", { date: edited })}</Mono> : null}
      <View style={styles.body}>
        <Markdown testID="legal-body" source={body} direction="ltr" />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({ body: { paddingTop: 8, paddingBottom: 32 } });
