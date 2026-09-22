import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { directionOf } from "@inborn/core";
import { Icon, dark, radius } from "@inborn/ui";
import { Seal, type SealState } from "../../components/Seal";
import { useType } from "../../services/type";
import { useAppServices } from "../../services/AppServices";
import { modelLabel } from "../../lib/models";
import { useHandsFree } from "../../voice/useHandsFree";
import { whisperInstalled } from "../../voice/whisper";
import { readDevice } from "../../vault/device";
import { Button } from "../../components/shell/primitives";
import { useBannerInset } from "../../components/shell/bannerInset";

interface Props {
  chatId: string | null;
  incognito: boolean;
  onClose: () => void;
  onOpenVault: () => void;
}

/**
 * S44 · Voice mode (Pro): a dark full screen, the seal as the only indicator (listening: ring + wave; thinking:
 * breathing; speaking: soft pulse), the live transcript, "Tap to interrupt", End. Everything runs on the phone.
 */
export function HandsFreeScreen({ chatId, incognito, onClose, onOpenVault }: Props) {
  const { t, i18n } = useTranslation();
  const type = useType();
  const insets = useSafeAreaInsets();
  const bannerInset = useBannerInset();
  const s = useAppServices();
  const theme = dark;
  const model = s.engine.model;
  const ready = whisperInstalled();
  const smallPhone = useMemo(() => readDevice().ramGB <= 6 && model.id !== "instant", [model.id]);
  if (!ready) {
    return (
      <View style={[styles.root, { backgroundColor: theme.bg, paddingTop: insets.top + 24 + bannerInset, paddingBottom: insets.bottom + 16 }]}>
        <Text style={[type.title, styles.center, { color: theme.text }]}>{t("voice.whisperMissing.title")}</Text>
        <Text style={[type.body, styles.center, { color: theme.text2 }]}>{t("voice.whisperMissing.body")}</Text>
        <View style={styles.actions}>
          <Button testID="voice-open-vault" title={t("voice.openVault")} onPress={onOpenVault} />
          <Button testID="voice-end" title={t("voice.end")} variant="secondary" onPress={onClose} />
        </View>
      </View>
    );
  }
  return <Loop chatId={chatId} incognito={incognito} onClose={onClose} smallPhone={smallPhone} uiLocale={i18n.language} modelId={model.id} />;
}

function Loop({ chatId, incognito, onClose, smallPhone, uiLocale, modelId }: { chatId: string | null; incognito: boolean; onClose: () => void; smallPhone: boolean; uiLocale: string; modelId: string }) {
  const { t } = useTranslation();
  const type = useType();
  const insets = useSafeAreaInsets();
  const bannerInset = useBannerInset();
  const s = useAppServices();
  const theme = dark;
  const hf = useHandsFree({ store: s.store, chatId, incognito, modelId, uiLocale, onChatCreated: s.chatCreated });
  const { phase, live, note, turns } = hf.state;
  const [closing, setClosing] = useState(false);
  useEffect(() => {
    if (phase === "ended" && !closing) {
      setClosing(true);
      const timer = setTimeout(onClose, note ? 1600 : 200);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [phase, note, closing, onClose]);

  const sealState: SealState = phase === "thinking" ? "generating" : phase === "paused" || phase === "ended" ? "open" : "sealed";
  const label = t(phase === "listening" ? "voice.listening" : phase === "transcribing" ? "voice.transcribing" : phase === "thinking" ? "voice.thinking" : phase === "speaking" ? "voice.speaking" : phase === "paused" ? "voice.paused" : "voice.ended");
  const lastUser = [...turns].reverse().find((x) => x.role === "user")?.text;
  const shown = live || lastUser || "";
  const dir = directionOf(shown);
  const hint = phase === "listening" ? t("voice.tapToFinish") : phase === "speaking" || phase === "thinking" ? t("voice.tapToInterrupt") : "";
  const bars = 9;
  return (
    <Pressable testID="voice-screen" accessibilityRole="button" accessibilityLabel={hint || label} onPress={hf.tap} style={[styles.root, { backgroundColor: theme.bg, paddingTop: insets.top + 16 + bannerInset, paddingBottom: insets.bottom + 16 }]}>
      <View style={styles.header}>
        <Text style={[type.monoLabel, { color: theme.text3 }]}>{t("voice.onDevice")}</Text>
        <Text style={[type.monoLabel, { color: theme.text3 }]}>{modelLabel(modelId)}</Text>
      </View>
      <View style={styles.sealWrap}>
        <View style={[styles.ring, { borderColor: phase === "listening" ? (hf.speaking ? theme.accent : theme.sealed) : "transparent", opacity: phase === "listening" ? 0.35 + hf.level * 0.65 : 0 }]} />
        <Seal size={96} color={phase === "speaking" ? theme.accent : theme.sealed} glow={theme.accent} state={sealState} generating={phase === "thinking" || phase === "speaking"} label={label} testID="voice-seal" />
        {phase === "listening" ? (
          <View testID="voice-wave" style={styles.wave} accessible={false}>
            {Array.from({ length: bars }, (_, i) => {
              const centre = 1 - Math.abs(i - (bars - 1) / 2) / ((bars - 1) / 2);
              const h = 4 + hf.level * 28 * (0.4 + centre * 0.6);
              return <View key={i} style={[styles.bar, { height: h, backgroundColor: hf.speaking ? theme.accent : theme.text3 }]} />;
            })}
          </View>
        ) : null}
        <Text testID="voice-phase" style={[type.monoLabel, { color: phase === "speaking" ? theme.accent : theme.sealed }]}>
          {label.toUpperCase()}
        </Text>
      </View>
      <View style={styles.transcript}>
        {shown ? (
          <Text testID="voice-live" style={[type.title, { color: phase === "speaking" || phase === "thinking" ? theme.text : theme.text2, writingDirection: dir, textAlign: "center" }]} numberOfLines={6}>
            {shown}
          </Text>
        ) : null}
        {note ? (
          <Text testID="voice-note" style={[type.bodySmall, styles.center, { color: theme.text2 }]}>
            {t(note)}
          </Text>
        ) : null}
        {smallPhone && phase === "listening" && turns.length === 0 ? <Text style={[type.caption, styles.center, { color: theme.text3 }]}>{t("voice.instantHint")}</Text> : null}
      </View>
      <View style={styles.footer}>
        <Text style={[type.caption, styles.center, { color: theme.text3 }]}>{hint}</Text>
        <Pressable testID="voice-end" accessibilityRole="button" accessibilityLabel={t("voice.end")} onPress={hf.end} style={[styles.endBtn, { backgroundColor: theme.surface2, borderColor: theme.border }]}>
          <Icon name="x" size={18} color={theme.text} />
          <Text style={[type.body, { color: theme.text }]}>{t("voice.end")}</Text>
        </Pressable>
        {__DEV__ ? (
          <Text testID="voice-timings" style={[type.mono, styles.center, { color: theme.text3 }]}>
            {[hf.timings.whisperLoadMs !== undefined ? `whisper ${hf.timings.whisperLoadMs} ms` : "", hf.timings.transcribeMs !== undefined ? `stt ${hf.timings.transcribeMs} ms` : "", hf.timings.answerMs !== undefined ? `llm ${hf.timings.answerMs} ms` : "", hf.timings.ttsStartMs !== undefined ? `tts ${hf.timings.ttsStartMs} ms` : ""].filter(Boolean).join(" · ")}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 24, justifyContent: "space-between" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sealWrap: { alignItems: "center", gap: 14, marginTop: 56 },
  ring: { position: "absolute", top: -16, width: 128, height: 128, borderRadius: 64, borderWidth: 2 },
  wave: { flexDirection: "row", alignItems: "center", gap: 4, height: 32 },
  bar: { width: 4, borderRadius: 2 },
  transcript: { flex: 1, justifyContent: "center", gap: 12, paddingVertical: 16 },
  center: { textAlign: "center" },
  footer: { alignItems: "center", gap: 12 },
  endBtn: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 48, paddingHorizontal: 22, borderRadius: radius.control, borderWidth: 1 },
  actions: { gap: 12 },
});
