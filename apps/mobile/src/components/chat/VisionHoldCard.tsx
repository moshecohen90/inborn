import { useEffect, useRef } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { radius, type Theme } from "@inborn/ui";
import { formatModelBytes } from "@inborn/core";
import { VISION_MODEL_ID, installVision } from "../../images";
import { releasesHeldTurn } from "../../lib/visionGate";
import { useVault } from "../../vault/hooks";
import { useType } from "../../services/type";

export interface VisionHoldCardProps {
  offer: "switch" | "companion";
  theme: Theme;
  model: string;
  seer: string;
  seerReady: boolean;
  photos: number;
  onSwitch: () => void;
  onRemove: () => void;
  onOpenVault: () => void;
  /** The pack landed while the turn was held: send it. */
  onReady: () => void;
}

/** QA F343: the message and its photos stay in the composer until a model can see them; the only ways on are here. */
export function VisionHoldCard({ offer, theme, model, seer, seerReady, photos, onSwitch, onRemove, onOpenVault, onReady }: VisionHoldCardProps) {
  const type = useType();
  const { t } = useTranslation();
  const { vault } = useVault();
  /* The browser engine has no projector path, so there the pack exists in the catalog but cannot be fetched. */
  const pack = Platform.OS === "web" ? undefined : vault.model(VISION_MODEL_ID);
  const state = vault.state(VISION_MODEL_ID);
  const size = pack ? formatModelBytes(pack.bytes) : "";
  const prev = useRef<string | undefined>(state.kind);
  useEffect(() => {
    const before = prev.current;
    prev.current = state.kind;
    if (releasesHeldTurn(true, before, state.kind)) onReady();
  }, [state.kind, onReady]);
  const packReady = state.kind === "ready";
  const moving = state.kind === "delivering" || state.kind === "verifying";
  const stuck = state.kind === "delivering" && (state.paused || state.waitingForWifi || state.needsConfirmation);
  const pct = state.kind === "delivering" && state.total > 0 ? Math.floor((state.bytes / state.total) * 100) : 100;
  const failed = state.kind === "failed" || state.kind === "needs-space" || state.kind === "corrupt" || state.kind === "quarantined";
  const title = offer === "switch" ? t("chat.vision.holdTitleModel", { model }) : "";
  const body = moving && !stuck
    ? t("chat.vision.holdDownloading", { pct })
    : stuck || failed
      ? t("chat.vision.holdStuck")
      : packReady
        ? t("chat.vision.holdSwitch", { seer })
        : pack
          ? t("chat.vision.holdBody", { size })
          : t("chat.vision.holdNoPack");
  return (
    <View testID="vision-hold" accessibilityLiveRegion="polite" style={[styles.card, { backgroundColor: theme.surface1, borderColor: theme.accent }]}>
      {title ? (
        <Text testID="vision-hold-title" style={[type.bodySmall, type.strong, { color: theme.text }]}>
          {title}
        </Text>
      ) : null}
      <Text testID="vision-hold-body" style={[type.bodySmall, title ? { color: theme.text2 } : type.strong, title ? null : { color: theme.text }]}>
        {body}
      </Text>
      <View style={styles.actions}>
        {pack && !packReady && !moving && !failed ? (
          <Pressable testID="vision-hold-download" accessibilityRole="button" onPress={() => void installVision().catch(() => undefined)} style={[styles.btn, { backgroundColor: theme.ctaFill }]}>
            <Text numberOfLines={1} style={[type.bodySmall, type.strong, { color: theme.ctaText }]}>
              {t("chat.vision.holdDownload", { size })}
            </Text>
          </Pressable>
        ) : null}
        {stuck || failed ? (
          <Pressable testID="vision-hold-vault" accessibilityRole="button" onPress={onOpenVault} style={[styles.btn, { backgroundColor: theme.ctaFill }]}>
            <Text numberOfLines={1} style={[type.bodySmall, type.strong, { color: theme.ctaText }]}>
              {t("voice.openVault")}
            </Text>
          </Pressable>
        ) : null}
        {offer === "switch" && seer ? (
          <Pressable testID="vision-hold-switch" accessibilityRole="button" onPress={onSwitch} style={[styles.btn, { borderWidth: 1, borderColor: theme.accent }]}>
            <Text numberOfLines={1} style={[type.bodySmall, { color: theme.accent }]}>
              {seerReady ? t("chat.modelAdvice.switch", { model: seer }) : t("voice.openVault")}
            </Text>
          </Pressable>
        ) : null}
        <Pressable testID="vision-hold-remove" accessibilityRole="button" onPress={onRemove} hitSlop={8} style={styles.textBtn}>
          <Text style={[type.bodySmall, { color: theme.text2 }]}>{t("chat.vision.holdRemove", { count: photos })}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: 16, marginTop: 8, padding: 12, gap: 6, borderWidth: 1, borderRadius: radius.card },
  actions: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 10, marginTop: 2 },
  btn: { minHeight: 44, paddingHorizontal: 12, borderRadius: radius.control, alignItems: "center", justifyContent: "center", maxWidth: "100%" },
  textBtn: { minHeight: 44, justifyContent: "center", paddingHorizontal: 4 },
});
