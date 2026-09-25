import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { formatModelBytes } from "@inborn/core";
import { MIN_TOUCH, radius, type Theme } from "@inborn/ui";
import { installEmbedder } from "../../documents/embedder";
import { indexModelPercent, useIndexModel } from "../../documents/useIndexModel";
import { installFailureText } from "../../vault/failureText";
import { useType } from "../../services/type";

export interface IndexHoldCardProps {
  theme: Theme;
  /** Documents attached to the held message. */
  files: number;
  /** Send now, the files searched by their words only. */
  onWords: () => void;
  onCancel: () => void;
}

/**
 * Round 93: Send with a file attached and no document index model stops here, the message kept in the composer.
 * The turn goes on by itself once the model lands (Chat watches the library), or with words only if the user says so.
 */
export function IndexHoldCard({ theme, files, onWords, onCancel }: IndexHoldCardProps) {
  const type = useType();
  const { t } = useTranslation();
  const state = useIndexModel();
  const size = state.kind === "missing" || state.kind === "failed" ? formatModelBytes(state.bytes) : "";
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;
  const body =
    state.kind === "downloading"
      ? t("documents.hold.downloading", { pct: indexModelPercent(state) })
      : state.kind === "unavailable"
        ? t("documents.hold.unavailable", { count: files })
        : t("documents.hold.body", { count: files, size });
  return (
    <View testID="docs-hold" aria-live="polite" style={[styles.card, { backgroundColor: theme.surface1, borderColor: theme.accent }]}>
      <Text testID="docs-hold-body" style={[type.bodySmall, type.strong, { color: theme.text }]}>
        {body}
      </Text>
      {state.kind === "failed" ? (
        <Text testID="docs-hold-error" style={[type.bodySmall, { color: theme.danger }]}>
          {installFailureText(t, state.error, Platform.OS, offline)}
        </Text>
      ) : null}
      <View style={styles.actions}>
        {state.kind === "missing" || state.kind === "failed" ? (
          <Pressable testID="docs-hold-download" accessibilityRole="button" onPress={() => void installEmbedder().catch(() => undefined)} style={[styles.btn, { backgroundColor: theme.ctaFill }]}>
            <Text numberOfLines={1} style={[type.bodySmall, type.strong, { color: theme.ctaText }]}>
              {state.kind === "failed" ? t("documents.hold.retry") : t("documents.hold.download", { size })}
            </Text>
          </Pressable>
        ) : null}
        <Pressable testID="docs-hold-words" accessibilityRole="button" onPress={onWords} style={[styles.btn, { borderWidth: 1, borderColor: theme.accent }]}>
          <Text numberOfLines={1} style={[type.bodySmall, { color: theme.accent }]}>
            {t("documents.hold.words")}
          </Text>
        </Pressable>
        <Pressable testID="docs-hold-cancel" accessibilityRole="button" onPress={onCancel} hitSlop={8} style={styles.textBtn}>
          <Text style={[type.bodySmall, { color: theme.text2 }]}>{t("documents.hold.cancel")}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: 16, marginTop: 8, padding: 12, gap: 6, borderWidth: 1, borderRadius: radius.card },
  actions: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 10, marginTop: 2 },
  btn: { minHeight: MIN_TOUCH, paddingHorizontal: 12, borderRadius: radius.control, alignItems: "center", justifyContent: "center", maxWidth: "100%" },
  textBtn: { minHeight: MIN_TOUCH, minWidth: MIN_TOUCH, justifyContent: "center", paddingHorizontal: 4 },
});
