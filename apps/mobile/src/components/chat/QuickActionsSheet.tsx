import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Icon } from "@inborn/ui";
import { QUICK_ACTIONS, TRANSLATION_LANGUAGES, buildQuickActionMessages, clipForAction, detectLanguage, directionOf, languageNameOf, pickTranslationTarget, quickActionAsChatTurn, type Delta, type Message, type QuickActionId } from "@inborn/core";
import { useTheme } from "../../lib/theme";
import { useType } from "../../services/type";
import { copyText } from "../../lib/clipboard";
import { Markdown } from "./Markdown";
import { Sheet } from "./Sheet";
import { shape } from "./styles";

export interface QuickActionsSheetProps {
  visible: boolean;
  onClose: () => void;
  /** The text the action runs on: a message, or what another app shared (S43). */
  text: string;
  /** "Replace" is offered only for Android PROCESS_TEXT from an editable field. */
  replaceable?: boolean;
  /** Streams one answer from the loaded model; the sheet owns the abort signal. */
  /** `turn` carries the action and the text so the caller can plan the answer's length (F38). */
  run: (messages: Message[], signal: AbortSignal, turn: { action: QuickActionId; text: string }) => AsyncIterable<Delta>;
  /** The chat is busy with its own answer: chips wait. */
  busy: boolean;
  onReplace?: (result: string) => void;
  /** Continue in the conversation: the action as a user turn, plus the streamed result when there is one. */
  onOpenInChat: (userTurn: string, result: string | null) => void;
  uiLocale: string;
  onToast: (message: string) => void;
}

/** S43 quick actions (spec §7.6): the six Free actions on a piece of text, result streamed in place, then Copy / Replace / Open in chat. */
export function QuickActionsSheet({ visible, onClose, text, replaceable, run, busy, onReplace, onOpenInChat, uiLocale, onToast }: QuickActionsSheetProps) {
  const type = useType();
  const theme = useTheme();
  const { t } = useTranslation();
  const [action, setAction] = useState<QuickActionId | null>(null);
  const [result, setResult] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const clipped = useMemo(() => clipForAction(text), [text]);
  const detected = useMemo(() => detectLanguage(clipped.text), [clipped.text]);
  const targetCode = target ?? pickTranslationTarget(detected, uiLocale);
  const dir = directionOf(clipped.text);

  /* A new text (another share, another message) starts the sheet clean. */
  useEffect(() => {
    abort.current?.abort();
    setAction(null);
    setResult("");
    setError(null);
    setStreaming(false);
    setTarget(null);
  }, [text, visible]);

  const stop = () => {
    abort.current?.abort();
    abort.current = null;
  };

  const start = async (next: QuickActionId, targetLanguage = targetCode) => {
    stop();
    const ac = new AbortController();
    abort.current = ac;
    setAction(next);
    setResult("");
    setError(null);
    setStreaming(true);
    let out = "";
    try {
      for await (const d of run(buildQuickActionMessages({ action: next, text: clipped.text, targetLanguage }), ac.signal, { action: next, text: clipped.text })) {
        if (d.text) {
          out += d.text;
          const snapshot = out;
          setResult(snapshot);
        }
      }
    } catch (e: unknown) {
      if (!ac.signal.aborted) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (abort.current === ac) {
        abort.current = null;
        setStreaming(false);
      }
    }
  };

  const cycleTarget = () => {
    const codes = TRANSLATION_LANGUAGES.map((l) => l.code);
    const next = codes[(codes.indexOf(targetCode) + 1) % codes.length]!;
    setTarget(next);
    if (action === "translate") void start("translate", next);
  };

  const userTurn = action ? quickActionAsChatTurn({ action, text: clipped.text, targetLanguage: targetCode }) : clipped.text;
  const label = (code: string) => t(`language.${code}`, { defaultValue: languageNameOf(code) });

  return (
    <Sheet
      visible={visible}
      onClose={() => {
        stop();
        onClose();
      }}
      title={t("quick.title")}
      testID="quick-actions"
    >
      <View style={styles.body}>
        <View style={[styles.source, { borderColor: theme.border, backgroundColor: theme.well }]}>
          <Text testID="quick-source" numberOfLines={4} style={[type.bodySmall, { color: theme.text2, writingDirection: dir, textAlign: dir === "rtl" ? "right" : "left" }]}>
            {clipped.text}
          </Text>
          {clipped.truncated ? <Text style={[type.caption, { color: theme.accent }]}>{t("quick.truncated", { count: clipped.text.length })}</Text> : null}
        </View>
        <View style={styles.chips}>
          {QUICK_ACTIONS.map((a) => {
            const selected = action === a;
            return (
              <Pressable
                key={a}
                testID={`quick-${a}`}
                accessibilityRole="button"
                accessibilityState={{ selected, disabled: busy }}
                disabled={busy}
                onPress={() => void start(a)}
                style={[shape.chip, styles.chip, { backgroundColor: selected ? theme.ctaFill : theme.surface2, borderColor: selected ? theme.ctaFill : theme.border, opacity: busy ? 0.5 : 1 }]}
              >
                <Text style={[type.bodySmall, { color: selected ? theme.ctaText : theme.text }]}>{t(`quick.action.${a}`)}</Text>
              </Pressable>
            );
          })}
        </View>
        <Pressable testID="quick-target" accessibilityRole="button" onPress={cycleTarget} style={styles.targetRow}>
          <Text style={[type.caption, { color: theme.text3 }]}>{detected ? t("quick.detected", { language: label(detected) }) : t("quick.detectedNone")}</Text>
          <Text style={[type.caption, { color: theme.accent }]}>{t("quick.target", { language: label(targetCode) })}</Text>
        </Pressable>
        {action ? (
          <ScrollView style={styles.result} contentContainerStyle={styles.resultContent} keyboardShouldPersistTaps="handled">
            {result ? <Markdown testID="quick-result" source={result} direction={directionOf(result)} caret={streaming} /> : streaming ? <Text style={[type.bodySmall, { color: theme.text3 }]}>{t("quick.working")}</Text> : null}
            {error ? <Text style={[type.bodySmall, { color: theme.danger }]}>{error}</Text> : null}
          </ScrollView>
        ) : null}
        <View style={styles.actions}>
          {streaming ? (
            <Pressable testID="quick-stop" accessibilityRole="button" onPress={stop} style={[shape.control, styles.btn, { backgroundColor: theme.danger }]}>
              <Icon name="stop" size={14} color={theme.onDanger} fill />
              <Text style={[type.bodySmall, type.strong, { color: theme.onDanger }]}>{t("chat.stop")}</Text>
            </Pressable>
          ) : null}
          {result && !streaming ? (
            <Pressable
              testID="quick-copy"
              accessibilityRole="button"
              onPress={() => {
                void copyText(result);
                onToast(t("chat.copied"));
              }}
              style={[shape.control, styles.btn, { borderWidth: 1, borderColor: theme.border }]}
            >
              <Text style={[type.bodySmall, type.strong, { color: theme.text }]}>{t("chat.copy")}</Text>
            </Pressable>
          ) : null}
          {result && !streaming && replaceable && onReplace ? (
            <Pressable testID="quick-replace" accessibilityRole="button" onPress={() => onReplace(result)} style={[shape.control, styles.btn, { backgroundColor: theme.ctaFill }]}>
              <Text style={[type.bodySmall, type.strong, { color: theme.ctaText }]}>{t("quick.replace")}</Text>
            </Pressable>
          ) : null}
          {!streaming ? (
            <Pressable testID="quick-open-chat" accessibilityRole="button" onPress={() => onOpenInChat(userTurn, result || null)} style={[shape.control, styles.btn, { borderWidth: 1, borderColor: theme.border }]}>
              <Text style={[type.bodySmall, type.strong, { color: theme.text }]}>{t("quick.openInChat")}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 12, paddingBottom: 8, gap: 10 },
  source: { borderWidth: 1, borderRadius: 12, padding: 10, gap: 4 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { minHeight: 36, paddingHorizontal: 12 },
  targetRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 8, minHeight: 28, alignItems: "center" },
  result: { maxHeight: 260, flexGrow: 0 },
  resultContent: { paddingVertical: 4 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  btn: { flexDirection: "row", gap: 6, minHeight: 40, paddingHorizontal: 14 },
});
