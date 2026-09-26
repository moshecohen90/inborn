import { useEffect, useRef, type ReactNode } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { findExtension, formatModelBytes } from "@inborn/core";
import { MIN_TOUCH, radius, type Theme } from "@inborn/ui";
import { holdTestIds, holdView } from "../../extensions/card";
import { extensionReleases } from "../../extensions/state";
import { installExtension, resumeExtension } from "../../extensions/store";
import { useExtension } from "../../extensions/useExtension";
import { installFailureText } from "../../vault/failureText";
import { useType } from "../../services/type";

export interface ExtensionHoldCardProps {
  extensionId: string;
  theme: Theme;
  /** Attachments held in the composer. */
  count: number;
  onCancel: () => void;
  /** Present when the extension has a fallback (the word search): send now without it. */
  onFallback?: () => void;
  /** The extension landed while the turn was held: send it. */
  onReady?: () => void;
  onOpenVault?: () => void;
  /** A heading above the body (e.g. "Fast can't see photos"). */
  title?: string;
  /** Replaces the body line when the caller knows better (the photo pack is ready but another model must see it). */
  body?: string;
  /** One honest line on how long the work takes here. */
  hint?: string;
  /** Extra actions of the caller (Switch to Instant). */
  children?: ReactNode;
}

/**
 * Round 105: one card for every extension a held message needs (the document index, the photo pack, whatever comes
 * next). The message stays in the composer; Download fetches the registry's file, the turn goes on by itself once it
 * is ready, and the fallback (when the extension has one) sends it now without.
 */
export function ExtensionHoldCard({ extensionId, theme, count, onCancel, onFallback, onReady, onOpenVault, title, body, hint, children }: ExtensionHoldCardProps) {
  const type = useType();
  const { t } = useTranslation();
  const state = useExtension(extensionId);
  const ext = findExtension(extensionId);
  const prev = useRef<string | undefined>(state.kind);
  useEffect(() => {
    const before = prev.current;
    prev.current = state.kind;
    if (extensionReleases(before, state.kind)) onReady?.();
  }, [state.kind, onReady]);
  if (!ext) return null;
  const ids = holdTestIds(ext);
  const size = formatModelBytes(state.kind === "missing" || state.kind === "failed" ? state.bytes || ext.bytes : ext.bytes);
  const view = holdView(ext, state, { count, size });
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;
  return (
    <View testID={ids.card} aria-live="polite" style={[styles.card, { backgroundColor: theme.surface1, borderColor: theme.accent }]}>
      {title ? (
        <Text testID={`${ids.card}-title`} style={[type.bodySmall, type.strong, { color: theme.text }]}>
          {title}
        </Text>
      ) : null}
      <Text testID={ids.body} style={[type.bodySmall, title ? { color: theme.text2 } : type.strong, title ? null : { color: theme.text }]}>
        {body ?? t(view.body.key, view.body.params)}
      </Text>
      {view.error !== null ? (
        <Text testID={ids.error} style={[type.bodySmall, { color: theme.danger }]}>
          {installFailureText(t, view.error, Platform.OS, offline)}
        </Text>
      ) : null}
      {hint && state.kind !== "unavailable" ? (
        <Text testID={ids.time} style={[type.bodySmall, { color: theme.text2 }]}>
          {hint}
        </Text>
      ) : null}
      {view.keepOpen ? (
        <Text testID={ids.keepOpen} style={[type.bodySmall, { color: theme.text2 }]}>
          {t("vault.keepOpen")}
        </Text>
      ) : null}
      <View style={styles.actions}>
        {view.download ? (
          <Pressable testID={ids.download} accessibilityRole="button" onPress={() => void installExtension(ext.id).catch(() => undefined)} style={[styles.btn, { backgroundColor: theme.ctaFill }]}>
            <Text numberOfLines={1} style={[type.bodySmall, type.strong, { color: theme.ctaText }]}>
              {t(view.download.key, view.download.params)}
            </Text>
          </Pressable>
        ) : null}
        {view.resume ? (
          <Pressable testID={ids.resume} accessibilityRole="button" onPress={() => void resumeExtension(ext.id).catch(() => undefined)} style={[styles.btn, { backgroundColor: theme.ctaFill }]}>
            <Text numberOfLines={1} style={[type.bodySmall, type.strong, { color: theme.ctaText }]}>
              {t("extensions.download", { size })}
            </Text>
          </Pressable>
        ) : null}
        {view.openVault && onOpenVault ? (
          <Pressable testID={ids.vault} accessibilityRole="button" onPress={onOpenVault} style={[styles.btn, { backgroundColor: theme.ctaFill }]}>
            <Text numberOfLines={1} style={[type.bodySmall, type.strong, { color: theme.ctaText }]}>
              {t("voice.openVault")}
            </Text>
          </Pressable>
        ) : null}
        {children}
        {view.fallback && onFallback ? (
          <Pressable testID={ids.fallback} accessibilityRole="button" onPress={onFallback} style={[styles.btn, { borderWidth: 1, borderColor: theme.accent }]}>
            <Text numberOfLines={1} style={[type.bodySmall, { color: theme.accent }]}>
              {t(view.fallback.key)}
            </Text>
          </Pressable>
        ) : null}
        <Pressable testID={ids.cancel} accessibilityRole="button" onPress={onCancel} hitSlop={8} style={styles.textBtn}>
          <Text style={[type.bodySmall, { color: theme.text2 }]}>{t(view.cancel.key, view.cancel.params)}</Text>
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
