import { memo, useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { citationsForAnswer, directionOf, type ChatMessage } from "@inborn/core";
import { Citations } from "../../documents/Citations";
import { useTheme } from "../../lib/theme";
import { modelLabel } from "../../lib/models";
import { Ledger } from "./Ledger";
import { Markdown } from "./Markdown";
import { useType } from "../../services/type";
import { Icon } from "@inborn/ui";
import { firstLineForSpeech, nextAnnouncement } from "../../lib/announce";

export type AssistantRow = ChatMessage & { streaming?: boolean; error?: string; loop?: boolean };

interface Props {
  row: AssistantRow;
  nCtx: number;
  quant?: string;
  onLongPress: () => void;
  onContinue?: () => void;
  onRegenerate?: () => void;
  onUnlock?: () => void;
}

/** Flat, full-width answer (§9.6): mono label, Markdown body, collapsed reasoning and ledger, states for stopped / loop / error. */
export const AssistantMessage = memo(function AssistantMessage({ row, nCtx, quant, onLongPress, onContinue, onRegenerate, onUnlock }: Props) {
  const type = useType();
  const theme = useTheme();
  const { t } = useTranslation();
  const [showReasoning, setShowReasoning] = useState(false);
  const dir = directionOf(row.content || row.reasoning || "");
  const waiting = !!row.streaming && !row.content && !row.reasoning;
  const header = t("chat.modelLabel", { model: modelLabel(row.modelId ?? "") });
  useStreamAnnouncements(row);
  const firstLine = firstLineForSpeech(row.content);
  const summary = {
    accessible: true,
    accessibilityLabel: firstLine ? `${header} · ${firstLine}` : header,
    accessibilityActions: [{ name: "readAnswer", label: t("chat.a11y.readAnswer") }],
    onAccessibilityAction: (e: { nativeEvent: { actionName: string } }) => {
      if (e.nativeEvent.actionName === "readAnswer" && row.content) AccessibilityInfo.announceForAccessibility(row.content);
    },
  };
  /* iOS merges an accessible row into one element and hides Continue, Regenerate and the chips (QA O12); Android keeps the children, so the row itself carries the summary there (QA T26). */
  const onHeader = Platform.OS === "ios";
  return (
    <Pressable testID="assistant-message" onLongPress={onLongPress} delayLongPress={350} {...(onHeader ? { accessible: false } : summary)} style={styles.root}>
      <Text {...(onHeader ? summary : {})} style={[type.monoLabel, { color: theme.text3 }]}>
        {header}
      </Text>
      {row.reasoning ? (
        <Pressable testID="reasoning-toggle" accessibilityRole="button" accessibilityState={{ expanded: showReasoning }} onPress={() => setShowReasoning((s) => !s)} style={styles.reasoningToggle}>
          <Icon name={showReasoning ? "chevronDown" : "chevronRight"} size={14} color={theme.text3} />
          <Text style={[type.monoLabel, { color: theme.text3 }]}>{row.reasoningMs !== undefined ? t("chat.reasoningTimed", { seconds: (row.reasoningMs / 1000).toFixed(1) }) : t("chat.reasoning")}</Text>
        </Pressable>
      ) : null}
      {row.reasoning && showReasoning ? (
        <View style={[styles.reasoning, { borderColor: theme.border }]}>
          <Text style={[type.bodySmall, { color: theme.text2, writingDirection: directionOf(row.reasoning), textAlign: directionOf(row.reasoning) === "rtl" ? "right" : "left" }]} selectable>
            {row.reasoning}
          </Text>
        </View>
      ) : null}
      {waiting ? <PulsingDot /> : <Markdown testID="assistant-text" source={row.content} direction={dir} caret={row.streaming} />}
      {row.error ? <Text style={[type.bodySmall, { color: theme.danger }]}>{row.error}</Text> : null}
      {!row.streaming && row.safety === "family-safe" ? (
        <Text testID="family-safe-note" style={[type.mono, { color: theme.text3 }]}>
          {t("chat.familySafe.note")}
        </Text>
      ) : null}
      {!row.streaming && (row.stopped || row.loop) ? (
        <View style={styles.stateRow}>
          <Text style={[type.mono, { color: theme.text3 }]}>{row.loop ? t("chat.loopDetected") : row.stoppedBy === "system" ? t("chat.stoppedBySystem") : t("chat.stopped")}</Text>
          {row.loop && onRegenerate ? (
            <Pressable testID="regenerate" accessibilityRole="button" onPress={onRegenerate} hitSlop={8} style={styles.inlineBtn}>
              <Text style={[type.caption, { color: theme.accent }]}>{t("chat.regenerate")}</Text>
            </Pressable>
          ) : row.stopped && onContinue ? (
            <Pressable testID="continue" accessibilityRole="button" onPress={onContinue} hitSlop={8} style={styles.inlineBtn}>
              <Text style={[type.caption, { color: theme.accent }]}>{t("chat.continue")}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {!row.streaming && row.content && row.citations?.length ? <CitationChips content={row.content} citations={row.citations} /> : null}
      {!row.streaming && row.content ? <Ledger message={row} nCtx={nCtx} quant={quant} onUnlock={onUnlock} /> : null}
    </Pressable>
  );
});

const ANNOUNCE_MIN_MS = 1500;

/* A live region would re-read the whole growing answer at every token; a screen reader hears each finished sentence once, at most every 1.5 s, and "Answer finished" at the end (QA T26). */
function useStreamAnnouncements(row: AssistantRow): void {
  const { t } = useTranslation();
  const announcedUpTo = useRef(0);
  const lastAt = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const streamed = useRef(false);
  const [reader, setReader] = useState(false);
  useEffect(() => {
    void AccessibilityInfo.isScreenReaderEnabled().then(setReader);
    const sub = AccessibilityInfo.addEventListener("screenReaderChanged", setReader);
    return () => sub.remove();
  }, []);
  useEffect(() => {
    if (!reader) return;
    if (row.streaming) {
      streamed.current = true;
      const next = nextAnnouncement(row.content, announcedUpTo.current);
      if (!next || timer.current) return;
      const fire = () => {
        timer.current = null;
        const chunk = nextAnnouncement(row.content, announcedUpTo.current);
        if (!chunk) return;
        announcedUpTo.current = chunk.upTo;
        lastAt.current = Date.now();
        if (chunk.text) AccessibilityInfo.announceForAccessibility(chunk.text);
      };
      const wait = ANNOUNCE_MIN_MS - (Date.now() - lastAt.current);
      if (wait <= 0) fire();
      else timer.current = setTimeout(fire, wait);
      return;
    }
    if (!streamed.current) return;
    streamed.current = false;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const rest = nextAnnouncement(`${row.content}\n`, announcedUpTo.current)?.text ?? "";
    announcedUpTo.current = row.content.length;
    AccessibilityInfo.announceForAccessibility(rest ? `${rest} ${t("chat.a11y.answerFinished")}` : t("chat.a11y.answerFinished"));
  }, [reader, row.content, row.streaming, t]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
}

function CitationChips({ content, citations }: { content: string; citations: NonNullable<ChatMessage["citations"]> }) {
  const { shown, cited } = citationsForAnswer(content, citations);
  return <Citations citations={shown} cited={cited} />;
}

/** The waiting window before the first token (§9.6): a pulsing dot, 200 ms to 2 s. */
function PulsingDot() {
  const theme = useTheme();
  const opacity = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return <Animated.View testID="pulsing-dot" style={[styles.dot, { backgroundColor: theme.text2, opacity }]} />;
}

const styles = StyleSheet.create({
  root: { gap: 6 },
  reasoningToggle: { minHeight: 28, flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start" },
  reasoning: { borderLeftWidth: 1, paddingLeft: 10, paddingVertical: 2 },
  dot: { width: 8, height: 8, borderRadius: 4, marginVertical: 8 },
  stateRow: { flexDirection: "row", alignItems: "center", gap: 12, flexWrap: "wrap" },
  inlineBtn: { minHeight: 28, justifyContent: "center" },
});
