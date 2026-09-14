import { useEffect, useRef, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import { radius, type Theme } from "@inborn/ui";
import { NOT_FOUND_TOKEN, directionOf, type Citation, type DocumentRecord, type Session } from "@inborn/core";
import { getEngine, loadSession } from "../../engine";
import { modelLabel } from "../../lib/models";
import { Citations } from "../../documents/Citations";
import { Markdown } from "../../components/chat/Markdown";
import { canCiteMarkers, getLibrary } from "../../documents/library";
import { font } from "../../services/type";
import { Toggle } from "../../components/shell/primitives";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useKeyboardLift } from "../../lib/keyboard";
import { useOpenSheet } from "../../lib/openSheets";

export interface AskDocumentsProps {
  docs: DocumentRecord[];
  theme: Theme;
  onClose: () => void;
  /** Dev proofs: ask this at once and report the outcome. */
  autoQuestion?: string;
  onResult?: (r: AskOutcome) => void;
}

export interface AskOutcome {
  question: string;
  answer: string;
  citations: Citation[];
  cited: boolean;
  notFound: boolean;
  retrieveMs: number;
  promptTokens: number;
  generateMs: number;
  tokPerSec: number;
  used: Array<{ doc: string; page: number; cosine: number; bm25: number }>;
}

type Phase = { kind: "idle" } | { kind: "loading" } | { kind: "retrieving" } | { kind: "answering" } | { kind: "done" } | { kind: "error"; error: string };

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * "Ask about selected" (S40) / "Ask this document": one question over the chosen documents, streamed answer,
 * citation chips, strict-mode "not found" without the model. The Chat screen gets the same pieces through
 * `useDocumentContext`; this sheet exists so the library works on its own.
 */
export function AskDocuments({ docs, theme, onClose, autoQuestion, onResult }: AskDocumentsProps) {
  const { t, i18n } = useTranslation();
  const library = getLibrary();
  const { engine, model } = getEngine();
  const session = useRef<Session | null>(null);
  const abort = useRef<AbortController | null>(null);
  const [question, setQuestion] = useState(autoQuestion ?? "");
  const [strict, setStrict] = useState(library.state().strict);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [answer, setAnswer] = useState("");
  const [citations, setCitations] = useState<{ shown: Citation[]; cited: boolean }>({ shown: [], cited: true });
  const [notFound, setNotFound] = useState(false);
  const [stats, setStats] = useState<string | null>(null);
  const autoFired = useRef(false);

  const ask = async (q: string) => {
    const text = q.trim();
    if (!text || phase.kind === "retrieving" || phase.kind === "answering") return;
    setAnswer("");
    setCitations({ shown: [], cited: true });
    setNotFound(false);
    setStats(null);
    const ac = new AbortController();
    abort.current = ac;
    try {
      setPhase({ kind: "loading" });
      const s = (session.current ??= await loadSession());
      setPhase({ kind: "retrieving" });
      const { prompt, retrieveMs } = await library.ask(text, { docIds: docs.map((d) => d.id), strict, nCtx: s.nCtx, answerLanguage: i18n.language, citeMarkers: canCiteMarkers(model.id) });
      const used = prompt.used.map((h) => ({ doc: library.document(h.chunk.docId)?.name ?? h.chunk.docId, page: h.chunk.page, cosine: Number(h.cosine.toFixed(3)), bm25: Number(h.bm25.toFixed(2)) }));
      if (prompt.noAnswer) {
        setNotFound(true);
        setPhase({ kind: "done" });
        setStats(t("documents.ask.retrieved", { ms: retrieveMs, count: 0 }));
        onResult?.({ question: text, answer: "", citations: [], cited: false, notFound: true, retrieveMs, promptTokens: 0, generateMs: 0, tokPerSec: 0, used });
        return;
      }
      setPhase({ kind: "answering" });
      const started = Date.now();
      let reply = "";
      let tps = 0;
      for await (const d of engine.generate(s, prompt.messages, { reasoning: false, maxTokens: 400 }, ac.signal)) {
        if (d.text) {
          reply += d.text;
          setAnswer(reply);
        }
        if (d.done) tps = d.done.tokPerSec;
      }
      const generateMs = Date.now() - started;
      const isNotFound = reply.trim().startsWith(NOT_FOUND_TOKEN) || reply.includes(NOT_FOUND_TOKEN);
      const shown = isNotFound ? { shown: [], cited: false } : library.citationsFor(reply, prompt.citations);
      setNotFound(isNotFound);
      if (isNotFound) setAnswer("");
      setCitations(shown);
      setPhase({ kind: "done" });
      setStats(`${t("documents.ask.retrieved", { ms: retrieveMs, count: prompt.used.length })} · ${t("documents.ask.generated", { ms: generateMs, tps: tps.toFixed(1), tokens: prompt.promptTokens })}`);
      onResult?.({ question: text, answer: reply, citations: shown.shown, cited: shown.cited, notFound: isNotFound, retrieveMs, promptTokens: prompt.promptTokens, generateMs, tokPerSec: tps, used });
    } catch (e: unknown) {
      const error = errorText(e);
      setPhase({ kind: "error", error });
      onResult?.({ question: text, answer: `ERROR: ${error}`, citations: [], cited: false, notFound: false, retrieveMs: 0, promptTokens: 0, generateMs: 0, tokPerSec: 0, used: [] });
    }
  };

  useEffect(() => {
    if (autoQuestion && !autoFired.current) {
      autoFired.current = true;
      void ask(autoQuestion);
    }
    return () => abort.current?.abort();
  }, []);

  const busy = phase.kind === "loading" || phase.kind === "retrieving" || phase.kind === "answering";
  const names = docs.map((d) => d.name).join(", ");
  const insets = useSafeAreaInsets();
  const lift = useKeyboardLift();
  useOpenSheet(true, onClose);
  return (
    <Modal animationType="slide" onRequestClose={onClose}>
      <View testID="ask-sheet" style={[styles.root, { backgroundColor: theme.bg, paddingBottom: lift || insets.bottom }]}>
        <View style={styles.header}>
          <Pressable accessibilityRole="button" onPress={onClose} style={styles.headerBtn}>
            <Text style={[styles.headerBtnText, { color: theme.text2 }]}>{t("documents.close")}</Text>
          </Pressable>
          <Text style={[styles.label, { color: theme.text3 }]}>{t("documents.ask.title")}</Text>
          <View style={styles.headerBtn} />
        </View>
        <Text numberOfLines={2} style={[styles.scope, { color: theme.text2 }]}>
          {t("documents.ask.scope", { count: docs.length, names })}
        </Text>
        <View style={[styles.strictRow, { borderColor: theme.border }]}>
          <View style={styles.strictText}>
            <Text style={[styles.strictTitle, { color: theme.text }]}>{t("documents.strict.title")}</Text>
            <Text style={[styles.strictHint, { color: theme.text3 }]}>{t("documents.strict.hint")}</Text>
          </View>
          <Toggle testID="ask-strict" label={t("documents.strict.title")} value={strict} onChange={(v) => { setStrict(v); library.setStrict(v); }} />
        </View>
        <ScrollView style={styles.answerWrap} contentContainerStyle={styles.answerContent}>
          {phase.kind === "loading" ? <Text style={[styles.mono, { color: theme.text3 }]}>{t("chat.loading", { model: modelLabel(model.id) })}</Text> : null}
          {phase.kind === "retrieving" ? <Text style={[styles.mono, { color: theme.text3 }]}>{t("documents.ask.searching")}</Text> : null}
          {phase.kind === "error" ? <Text style={[styles.body, { color: theme.danger }]}>{t(`documents.error.${phase.error}`, { defaultValue: phase.error })}</Text> : null}
          {notFound ? (
            <Text testID="ask-not-found" style={[styles.body, { color: theme.text }]}>
              {t("documents.notFound")}
            </Text>
          ) : null}
          {answer ? (
            <View style={styles.assistant}>
              <Text style={[styles.label, { color: theme.text3 }]}>{t("chat.modelLabel", { model: modelLabel(model.id) })}</Text>
              <Markdown testID="ask-answer" source={answer} direction={directionOf(answer)} caret={phase.kind === "answering"} />
            </View>
          ) : null}
          {phase.kind === "done" && !notFound ? <Citations citations={citations.shown} cited={citations.cited} /> : null}
          {stats ? (
            <Text testID="ask-stats" style={[styles.mono, { color: theme.text3 }]}>
              {stats}
            </Text>
          ) : null}
        </ScrollView>
        <View style={[styles.composer, { backgroundColor: theme.well, borderColor: theme.border }]}>
          <TextInput
            testID="ask-input"
            value={question}
            onChangeText={setQuestion}
            placeholder={t("documents.ask.placeholder")}
            placeholderTextColor={theme.text3}
            style={[styles.input, { color: theme.text }]}
            onSubmitEditing={() => void ask(question)}
            editable={!busy}
          />
          {busy ? (
            <Pressable testID="ask-stop" accessibilityRole="button" onPress={() => abort.current?.abort()} style={[styles.btn, { backgroundColor: theme.danger }]}>
              <Text style={[styles.stopText, { color: theme.onDanger }]}>{t("chat.stop")}</Text>
            </Pressable>
          ) : (
            <Pressable testID="ask-send" accessibilityRole="button" onPress={() => void ask(question)} style={[styles.btn, { backgroundColor: theme.ctaFill }]}>
              <Text style={[styles.sendGlyph, { color: theme.ctaText }]}>↑</Text>
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingTop: 48 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, height: 44 },
  headerBtn: { minWidth: 60, height: 44, justifyContent: "center" },
  headerBtnText: { ...font("sans"), fontSize: 16 },
  label: { ...font("mono", "500"), fontSize: 11, letterSpacing: 0.9, textTransform: "uppercase" },
  scope: { ...font("sans"), fontSize: 13, paddingHorizontal: 16, paddingBottom: 8 },
  strictRow: { flexDirection: "row", alignItems: "center", gap: 12, marginHorizontal: 16, paddingVertical: 10, borderTopWidth: 1, borderBottomWidth: 1 },
  strictText: { flex: 1, gap: 2 },
  strictTitle: { ...font("sans", "600"), fontSize: 15 },
  strictHint: { ...font("sans"), fontSize: 12 },
  answerWrap: { flex: 1 },
  answerContent: { padding: 16, gap: 12 },
  assistant: { gap: 4 },
  body: { ...font("sans"), fontSize: 16, lineHeight: 25 },
  mono: { ...font("mono"), fontSize: 12, letterSpacing: 0.5 },
  composer: { flexDirection: "row", alignItems: "center", margin: 12, borderWidth: 1, borderRadius: radius.card, paddingLeft: 12 },
  input: { flex: 1, ...font("sans"), fontSize: 16, minHeight: 44, paddingVertical: 10 },
  btn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", margin: 4 },
  stopText: { ...font("sans", "500"), fontSize: 12 },
  sendGlyph: { fontSize: 18 },
});
