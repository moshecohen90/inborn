import { memo, useEffect, useRef, useState } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { directionOf, type ChatMessage } from "@inborn/core";
import { useTheme } from "../../lib/theme";
import { modelLabel } from "../../lib/models";
import { Ledger } from "./Ledger";
import { Markdown } from "./Markdown";
import { type } from "./styles";

export type AssistantRow = ChatMessage & { streaming?: boolean; error?: string; loop?: boolean };

interface Props {
  row: AssistantRow;
  nCtx: number;
  quant?: string;
  onLongPress: () => void;
  onContinue?: () => void;
  onRegenerate?: () => void;
}

/** Flat, full-width answer (§9.6): mono label, Markdown body, collapsed reasoning and ledger, states for stopped / loop / error. */
export const AssistantMessage = memo(function AssistantMessage({ row, nCtx, quant, onLongPress, onContinue, onRegenerate }: Props) {
  const theme = useTheme();
  const { t } = useTranslation();
  const [showReasoning, setShowReasoning] = useState(false);
  const dir = directionOf(row.content || row.reasoning || "");
  const waiting = !!row.streaming && !row.content && !row.reasoning;
  return (
    <Pressable testID="assistant-message" onLongPress={onLongPress} delayLongPress={350} accessibilityRole="text" style={styles.root}>
      <Text style={[type.monoLabel, { color: theme.text3 }]}>{t("chat.modelLabel", { model: modelLabel(row.modelId ?? "") })}</Text>
      {row.reasoning ? (
        <Pressable testID="reasoning-toggle" accessibilityRole="button" accessibilityState={{ expanded: showReasoning }} onPress={() => setShowReasoning((s) => !s)} style={styles.reasoningToggle}>
          <Text style={[type.monoLabel, { color: theme.text3 }]}>
            {showReasoning ? "▾" : "▸"} {row.reasoningMs !== undefined ? t("chat.reasoningTimed", { seconds: (row.reasoningMs / 1000).toFixed(1) }) : t("chat.reasoning")}
          </Text>
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
      {!row.streaming && row.content ? <Ledger message={row} nCtx={nCtx} quant={quant} /> : null}
    </Pressable>
  );
});

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
  reasoningToggle: { minHeight: 28, justifyContent: "center", alignSelf: "flex-start" },
  reasoning: { borderLeftWidth: 1, paddingLeft: 10, paddingVertical: 2 },
  dot: { width: 8, height: 8, borderRadius: 4, marginVertical: 8 },
  stateRow: { flexDirection: "row", alignItems: "center", gap: 12, flexWrap: "wrap" },
  inlineBtn: { minHeight: 28, justifyContent: "center" },
});
