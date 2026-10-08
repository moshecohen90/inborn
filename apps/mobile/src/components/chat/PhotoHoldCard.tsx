import { useEffect, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { formatModelBytes } from "@inborn/core";
import { MIN_TOUCH, radius, type Theme } from "@inborn/ui";
import { holdTestIds } from "../../extensions/card";
import { activePath, photoHoldView, type HeldPhoto, type PhotoRoute } from "../../extensions/photoCard";
import { installPath, pendingPiece, usePathState } from "../../extensions/photoPath";
import { storeReachable } from "../../extensions/store";
import { installFailureText } from "../../vault/failureText";
import { offlineKey } from "../../lib/offlineWording";
import { useType } from "../../services/type";

export interface PhotoHoldCardProps {
  held: HeldPhoto;
  theme: Theme;
  count: number;
  /** Display names, not ids. */
  model: string;
  seer: string;
  hint?: string;
  onCancel: () => void;
  onReady: () => void;
  /** The switch must send the held turn by itself: the card is gone once it is called. */
  onSwitch: (modelId: string) => void;
  onOpenVault?: (focus: string) => void;
}

export function PhotoHoldCard({ held, theme, count, model, seer, hint, onCancel, onReady, onSwitch, onOpenVault }: PhotoHoldCardProps) {
  const type = useType();
  const { t } = useTranslation();
  const [route, setRoute] = useState<PhotoRoute>("own");
  /* The way out is idle until tapped (a path with nothing missing reads "ready" and must not switch on its own). */
  const [started, setStarted] = useState(false);
  const path = activePath(held, route);
  const onAlt = held.kind === "switch" || route === "alt";
  const live = usePathState(path);
  const state = onAlt && !started ? null : live;
  const prev = useRef<string>(onAlt ? "idle" : "missing");
  useEffect(() => {
    const before = prev.current;
    prev.current = state?.kind ?? "idle";
    if (!path || state?.kind !== "ready" || before === "ready") return;
    if (onAlt) onSwitch(path.model);
    else onReady();
  }, [state?.kind, onAlt, path, onReady, onSwitch]);

  const ids = holdTestIds({ id: path?.pack ?? "vision-qwen35", kind: "vision" });
  const view = photoHoldView(held, route, state, { count, model, seer, size: formatModelBytes, storeReachable: storeReachable() });
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;
  const takeWayOut = () => {
    if (held.kind === "none") return;
    const alt = held.alt;
    if (!alt) return;
    if (alt.missing.length === 0) return onSwitch(alt.model);
    setRoute("alt");
    setStarted(true);
    void installPath(alt).catch(() => undefined);
  };
  const act = () => {
    if (!path || !view.primary) return;
    switch (view.primary.action) {
      case "switch":
        return takeWayOut();
      case "vault":
        return onOpenVault?.(pendingPiece(path)?.id ?? path.pack);
      case "resume":
        setStarted(true);
        return void installPath(path, true).catch(() => undefined);
      default:
        setStarted(true);
        return void installPath(path).catch(() => undefined);
    }
  };
  const primaryId = view.primary?.action === "switch" ? `${ids.card}-switch` : view.primary?.action === "resume" ? ids.resume : view.primary?.action === "vault" ? ids.vault : ids.download;
  const tr = (m: { key: string; params?: Record<string, unknown> }) => t(m.key, m.params);
  return (
    <View testID={ids.card} aria-live="polite" style={[styles.card, { backgroundColor: theme.surface1, borderColor: theme.accent }]}>
      <Text testID={`${ids.card}-title`} style={[type.bodySmall, type.strong, { color: theme.text }]}>
        {tr(view.title)}
      </Text>
      {view.offline ? (
        <Text testID={`${ids.card}-offline`} style={[type.bodySmall, { color: theme.text }]}>
          {t(offlineKey("vault.state.noInternet"))}
        </Text>
      ) : null}
      <Text testID={ids.body} style={[type.bodySmall, { color: theme.text2 }]}>
        {tr(view.body)}
      </Text>
      {view.progress !== null ? (
        <View testID={`${ids.card}-progress`} style={[styles.track, { backgroundColor: theme.well }]}>
          <View style={[styles.fill, { width: `${Math.round(view.progress * 100)}%`, backgroundColor: theme.accent }]} />
        </View>
      ) : null}
      {view.error !== null ? (
        <Text testID={ids.error} style={[type.bodySmall, { color: theme.danger }]}>
          {view.error === "no-delivery" ? t("chat.vision.noStore") : installFailureText(t, view.error, Platform.OS, offline)}
        </Text>
      ) : null}
      {hint && !onAlt && state?.kind !== "unavailable" ? (
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
        {view.primary ? (
          <Pressable testID={primaryId} accessibilityRole="button" onPress={act} style={[styles.btn, { backgroundColor: theme.ctaFill }]}>
            <Text numberOfLines={1} style={[type.bodySmall, type.strong, { color: theme.ctaText }]}>
              {tr(view.primary.label)}
            </Text>
          </Pressable>
        ) : null}
        {view.secondary ? (
          <Pressable testID={`${ids.card}-switch`} accessibilityRole="button" onPress={takeWayOut} style={[styles.btn, { borderWidth: 1, borderColor: theme.accent }]}>
            <Text numberOfLines={1} style={[type.bodySmall, { color: theme.accent }]}>
              {tr(view.secondary)}
            </Text>
          </Pressable>
        ) : null}
        <Pressable testID={ids.cancel} accessibilityRole="button" onPress={onCancel} hitSlop={8} style={styles.textBtn}>
          <Text style={[type.bodySmall, { color: theme.text2 }]}>{tr(view.cancel)}</Text>
        </Pressable>
      </View>
      {view.caption ? (
        <Text testID={`${ids.card}-caption`} style={[type.caption, { color: theme.text2 }]}>
          {tr(view.caption)}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: 16, marginTop: 8, padding: 12, gap: 6, borderWidth: 1, borderRadius: radius.card },
  actions: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 10, marginTop: 2 },
  btn: { minHeight: MIN_TOUCH, paddingHorizontal: 12, borderRadius: radius.control, alignItems: "center", justifyContent: "center", maxWidth: "100%" },
  textBtn: { minHeight: MIN_TOUCH, minWidth: MIN_TOUCH, justifyContent: "center", paddingHorizontal: 0 },
  track: { height: 4, borderRadius: 2, overflow: "hidden" },
  fill: { height: 4, borderRadius: 2 },
});
