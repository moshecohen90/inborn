import { useEffect, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { SAFETY_BASELINE, formatBytes, type Message, type Session } from "@inborn/core";
import { Icon, radius } from "@inborn/ui";
import { useTheme } from "../../services/theme";
import { useAppServices } from "../../services/AppServices";
import { loadSession } from "../../engine";
import { openAirplaneSettings, useConnectivity } from "../../proof/connectivity";
import { Screen } from "../../components/shell/Screen";
import { Seal } from "../../components/Seal";
import { Button, Mono, MonoLabel } from "../../components/shell/primitives";
import { Markdown } from "../../components/chat/Markdown";
import { font, useType } from "../../services/type";

type Phase = "idle" | "loading" | "streaming" | "done" | "error";
const SUGGESTED = "What's 17 × 23?";
/* S03 shows one short plain line ("391."); tables and lists belong to the chat, not the proof. */
const AIRPLANE_SYSTEM = `${SAFETY_BASELINE} Answer in one or two short sentences of plain text: no Markdown, no tables, no lists.`;

/** S03: the user cuts the network with their own hands and watches the answer arrive anyway, with OUT/IN live. */
export function AirplaneTest({ onDone, doneLabel, skipLabel }: { onDone: () => void; doneLabel: string; skipLabel?: string }) {
  const type = useType();
  const { t } = useTranslation();
  const { theme } = useTheme();
  const router = useRouter();
  const { engine, meter, prefs } = useAppServices();
  const net = useConnectivity();
  const [question, setQuestion] = useState(SUGGESTED);
  const [answer, setAnswer] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const session = useRef<Session | null>(null);
  const abort = useRef<AbortController | null>(null);
  const start = useRef<{ out: number; in: number } | null>(null);

  useEffect(() => () => abort.current?.abort(), []);

  const ask = async () => {
    const text = question.trim();
    if (!text || phase === "streaming" || phase === "loading") return;
    setAnswer("");
    setError(null);
    setPhase("loading");
    start.current ??= { out: meter.out, in: meter.in };
    try {
      session.current ??= await loadSession();
      const ac = new AbortController();
      abort.current = ac;
      setPhase("streaming");
      const history: Message[] = [{ role: "system", content: AIRPLANE_SYSTEM }, { role: "user", content: text }];
      let reply = "";
      for await (const d of engine.engine.generate(session.current, history, { reasoning: false, maxTokens: 160 }, ac.signal)) {
        if (d.text) {
          reply += d.text;
          setAnswer(reply);
        }
      }
      setPhase("done");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("error");
    }
  };

  const outSince = start.current ? meter.out - start.current.out : 0;
  const inSince = start.current ? meter.in - start.current.in : 0;
  const modelName = engine.model.id.toUpperCase();
  const busy = phase === "loading" || phase === "streaming";

  return (
    <Screen
      header={{ back: true }}
      mesh
      testID="airplane-test"
      footer={
        <>
          {phase === "done" ? (
            <Button testID="airplane-saw-it" title={doneLabel} onPress={onDone} />
          ) : (
            <Button testID="airplane-ask" title={busy ? t("airplane.asking") : t("airplane.ask")} onPress={() => void ask()} disabled={busy || !question.trim()} />
          )}
          {skipLabel && phase !== "done" ? <Button testID="airplane-skip" title={skipLabel} variant="link" onPress={onDone} /> : null}
        </>
      }
    >
      <Text accessibilityRole="header" style={[type.title, { color: theme.text }]}>
        {t("airplane.title")}
      </Text>
      <View style={styles.step}>
        <Text style={[type.body, styles.grow, { color: theme.text }]}>{t("airplane.step1")}</Text>
        <Pressable
          testID="airplane-indicator"
          accessibilityRole="button"
          onPress={() => void openAirplaneSettings()}
          style={[styles.pill, { borderColor: net.offline ? theme.sealed : theme.border, backgroundColor: theme.surface2 }]}
        >
          <Icon name="plane" size={14} color={net.offline ? theme.sealed : theme.text2} />
          <MonoLabel color={net.offline ? theme.sealed : theme.text2}>{net.offline ? t("airplane.on") : t("airplane.off")}</MonoLabel>
        </Pressable>
      </View>
      <Text style={[type.bodySmall, { color: theme.text3 }]}>
        {Platform.OS === "ios" ? t("airplane.hint.ios") : Platform.OS === "android" ? t("airplane.hint.android") : t("airplane.hint.web")}
      </Text>
      <Text style={[type.body, { color: theme.text }]}>{t("airplane.step2")}</Text>
      <TextInput
        testID="airplane-question"
        value={question}
        onChangeText={setQuestion}
        editable={!busy}
        onSubmitEditing={() => void ask()}
        returnKeyType="send"
        accessibilityLabel={t("airplane.step2")}
        style={[styles.input, { color: theme.text, backgroundColor: theme.well, borderColor: theme.border }]}
      />
      {phase !== "idle" ? (
        <View testID="airplane-answer" style={styles.answer}>
          <View style={styles.answerHead}>
            <Seal size={20} state={busy ? "generating" : "sealed"} label={t("chat.sealed")} haptics={false} />
            <MonoLabel>{t("chat.modelLabel", { model: modelName })}</MonoLabel>
          </View>
          {phase === "loading" ? <Text style={[type.bodySmall, { color: theme.text3 }]}>{t("chat.loading", { model: modelName })}</Text> : null}
          {error ? (
            <Text style={[type.bodySmall, { color: theme.danger }]}>{error}</Text>
          ) : (
            <Markdown source={answer} caret={phase === "streaming"} testID="airplane-answer-text" />
          )}
        </View>
      ) : null}
      <View style={[styles.readout, { borderColor: theme.border, backgroundColor: theme.surface1 }]}>
        <Mono testID="airplane-meter" color={theme.text}>
          {t("proof.outIn", { out: formatBytes(outSince), in: formatBytes(inSince) })}
        </Mono>
        <Text style={[styles.note, { color: theme.text3 }]}>
          {meter.kind === "counter" ? t("airplane.meter.counter") : meter.kind === "log" && Platform.OS === "web" ? t("airplane.meter.web") : t("airplane.meter.ios")}
        </Text>
      </View>
      {phase === "done" ? (
        <Text testID="airplane-verdict" style={[type.bodySmall, { color: net.offline ? theme.sealed : theme.text2 }]}>
          {net.offline ? t("airplane.keepIt") : t("airplane.stillZero")}
        </Text>
      ) : null}
      {phase === "done" && !prefs.onboarded ? null : phase === "done" ? <Button title={t("proof.title")} variant="link" onPress={() => router.replace("/proof")} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  step: { flexDirection: "row", alignItems: "center", gap: 12 },
  grow: { flex: 1 },
  pill: { minHeight: 36, paddingHorizontal: 12, justifyContent: "center", borderWidth: 1, borderRadius: 999 , flexDirection: "row", alignItems: "center", gap: 6 },
  input: { minHeight: 48, borderWidth: 1, borderRadius: radius.control, paddingHorizontal: 14, ...font("sans"), fontSize: 16 },
  answer: { gap: 6, paddingTop: 4 },
  answerHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  readout: { borderWidth: 1, borderRadius: radius.control, padding: 12, gap: 4 },
  note: { ...font("sans"), fontSize: 12, lineHeight: 16 },
});
