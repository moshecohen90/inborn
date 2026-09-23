import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../services/theme";
import { Screen } from "../../components/shell/Screen";
import { Mono } from "../../components/shell/primitives";
import { Markdown } from "../../components/chat/Markdown";
import { legalScreen } from "./legalBody";
import privacy from "../../../../../docs/legal/privacy-policy.md";
import terms from "../../../../../docs/legal/terms.md";

export type LegalDoc = "privacy" | "terms";
const DOCS: Record<LegalDoc, string> = { privacy, terms };
export const isLegalDoc = (d: string | undefined): d is LegalDoc => d === "privacy" || d === "terms";

/** Privacy policy / terms (§11): the same Markdown the stores and the website show, rendered on the device. */
export function Legal({ doc }: { doc: LegalDoc }) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const { meta, body } = useMemo(() => legalScreen(DOCS[doc]), [doc]);
  const edited = /Last edited ([^.\n]+)/.exec(DOCS[doc])?.[1];
  return (
    <Screen header={{ back: true, title: t(doc === "privacy" ? "legal.privacy" : "legal.terms") }} testID={`legal-${doc}`}>
      {edited ? <Mono color={theme.text3}>{t("legal.edited", { date: edited })}</Mono> : null}
      {meta.length ? (
        <View testID="legal-meta" style={[styles.meta, { borderColor: theme.border }]}>
          {meta.map((line) => (
            <Mono key={line} color={theme.text3}>
              {line}
            </Mono>
          ))}
        </View>
      ) : null}
      <View style={styles.body}>
        <Markdown testID="legal-body" source={body} direction="ltr" />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  meta: { marginTop: 8, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, gap: 2 },
  body: { paddingTop: 8, paddingBottom: 32 },
});
