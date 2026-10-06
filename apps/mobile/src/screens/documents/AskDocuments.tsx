import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { AppModal } from "../../components/shell/AppModal";
import { useTranslation } from "react-i18next";
import { joinList } from "@inborn/i18n";
import { radius, type Theme } from "@inborn/ui";
import { isNotFoundReply, fileAsk, groundedCitations, directionOf, planAnswerLength, withoutEchoedLabels, type Citation, type DocumentRecord, type PaywallReason, type Session, type WholeFilePlan } from "@inborn/core";
import { getEngine, loadSession } from "../../engine";
import { chipLabel } from "../../lib/models";
import { Citations } from "../../documents/Citations";
import { Markdown } from "../../components/chat/Markdown";
import { canCiteMarkers, getLibrary } from "../../documents/library";
import { font } from "../../services/type";
import { Toggle } from "../../components/shell/primitives";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useKeyboardLift } from "../../lib/keyboard";
import { useOpenSheet } from "../../lib/openSheets";
import { askSheetRoute, askStatsLine, noPassageOpeners, readingPagesLine, saysNoneMatched, summaryScope } from "../../lib/docsGate";
import { useEntitlement } from "../../licence";
import { ProTag } from "../../components/chat/Sheet";
import { reindexNotice, type AnsweredMidReindex } from "../../lib/reindexNotice";
import { useDocuments } from "../../documents/hooks";

export interface AskDocumentsProps {
  docs: DocumentRecord[];
  theme: Theme;
  onClose: () => void;
  /** Dev proofs: ask this at once and report the outcome. */
  autoQuestion?: string;
  onResult?: (r: AskOutcome) => void;
  /** Free meets "Answer only from my documents" as the Pro row it is in the Documents panel (§7.3). */
  strictLocked?: boolean;
  onUnlock?: (reason: PaywallReason) => void;
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
export function AskDocuments({ docs, theme, onClose, autoQuestion, onResult, strictLocked = false, onUnlock }: AskDocumentsProps) {
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
  const [noneMatched, setNoneMatched] = useState(false);
  const [wordsOnly, setWordsOnly] = useState(false);
  const [reindexing, setReindexing] = useState<AnsweredMidReindex | null>(null);
  const { state: libraryState } = useDocuments();
  const reindexLine = reindexNotice(reindexing, libraryState.documents);
  const [stats, setStats] = useState<string | null>(null);
  const [readingPages, setReadingPages] = useState<string | null>(null);
  const { can } = useEntitlement();
  const detailed = can("detailedStats");
  const statsLine = askStatsLine(stats, detailed);
  const autoFired = useRef(false);

  /** Round 132: the selected files whole, or section by section with "Reading pages 1–2 of 9…" in the sheet; null once Stop is pressed. */
  const readWhole = async (s: Session, question: string, docIds: string[], system: string, signal: AbortSignal) => {
    try {
      return await library.readWhole(question, {
        docIds,
        nCtx: s.nCtx,
        systemPrompt: system,
        answerLanguage: i18n.language,
        citeMarkers: canCiteMarkers(model.id),
        signal,
        onSection: (_i, section, plan) => setReadingPages(readingPagesLine(t, section, plan.pagesTotal)),
        complete: async (wireMessages, maxTokens) => {
          let out = "";
          for await (const d of engine.generate(s, wireMessages, { reasoning: false, maxTokens, temperature: 0.3 }, signal)) if (d.text) out += d.text;
          return out;
        },
      });
    } finally {
      setReadingPages(null);
    }
  };

  const ask = async (q: string) => {
    const text = q.trim();
    if (!text || phase.kind === "retrieving" || phase.kind === "answering") return;
    setAnswer("");
    setCitations({ shown: [], cited: true });
    setNotFound(false);
    setNoneMatched(false);
    setWordsOnly(false);
    setReindexing(null);
    setStats(null);
    setReadingPages(null);
    const ac = new AbortController();
    abort.current = ac;
    /* Round 132: "summarize this file" reads the files whole, as the chat does; it needs no search, so strict mode has nothing to refuse. */
    const summary = fileAsk(text) === "summary";
    try {
      setPhase({ kind: "loading" });
      const s = (session.current ??= await loadSession());
      setPhase({ kind: "retrieving" });
      /* F38: a one-line question over documents gets a one-line answer; a wider one keeps room for the passages it must join. */
      const length = planAnswerLength({ text, use: summary ? "summarize" : "documents" });
      const docIds = docs.map((d) => d.id);
      const readStarted = Date.now();
      const whole = summary ? await readWhole(s, text, docIds, length.instruction, ac.signal) : null;
      if (ac.signal.aborted) return setPhase({ kind: "idle" });
      const scope: WholeFilePlan | null = whole?.plan ?? null;
      const { prompt, retrieveMs, reindexing: rebuilding, lexical } = whole
        ? { prompt: whole.prompt, retrieveMs: Date.now() - readStarted, reindexing: undefined, lexical: false }
        : await library.ask(text, { docIds, strict: strict && !strictLocked, nCtx: s.nCtx, answerLanguage: i18n.language, citeMarkers: canCiteMarkers(model.id), systemPrompt: length.instruction, openers: noPassageOpeners(t) });
      setReindexing(rebuilding ?? null);
      setWordsOnly(!!lexical);
      const used = scope
        ? scope.sections.flatMap((sec) => Array.from({ length: sec.to - sec.from + 1 }, (_, i) => ({ doc: library.document(sec.docId)?.name ?? sec.docId, page: sec.from + i, cosine: 0, bm25: 0 })))
        : prompt.used.map((h) => ({ doc: library.document(h.chunk.docId)?.name ?? h.chunk.docId, page: h.chunk.page, cosine: Number(h.cosine.toFixed(3)), bm25: Number(h.bm25.toFixed(2)) }));
      const route = askSheetRoute({ noAnswer: prompt.noAnswer });
      if (route === "not-found") {
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
      for await (const d of engine.generate(s, prompt.messages, { reasoning: false, maxTokens: length.maxTokens }, ac.signal)) {
        if (d.text) {
          reply += d.text;
          setAnswer(withoutEchoedLabels(reply, { streaming: true, citations: prompt.citations }));
        }
        if (d.done) tps = d.done.tokPerSec;
      }
      const generateMs = Date.now() - started;
      /* A stopped summary is half of one: the sheet goes back to the question, as it does when Stop lands while reading. */
      if (scope && ac.signal.aborted) {
        setAnswer("");
        return setPhase({ kind: "idle" });
      }
      /* F457: the chips judge the words on screen, so a copied passage header is neither a citation mark nor evidence. */
      reply = withoutEchoedLabels(reply);
      const isNotFound = !scope && isNotFoundReply(reply);
      const shown = isNotFound ? { shown: [], cited: false } : library.citationsFor(reply, groundedCitations(reply, text, prompt.used, prompt.citations));
      if (scope && reply.trim()) reply = `${reply.trimEnd()}\n\n*${summaryScope(t, scope, model.id === "instant" ? { current: chipLabel(t, model.id), better: chipLabel(t, "fast") } : undefined)}*`;
      setNotFound(isNotFound);
      setAnswer(isNotFound ? "" : reply);
      setCitations(shown);
      if (!scope && !isNotFound && saysNoneMatched({ continuing: false, attachedCount: docs.length, usedPassages: shown.shown.length })) setNoneMatched(true);
      setPhase({ kind: "done" });
      const found = scope ? t("documents.ask.read", { ms: retrieveMs, read: scope.pagesRead, count: scope.pagesTotal }) : t("documents.ask.retrieved", { ms: retrieveMs, count: prompt.used.length });
      setStats(`${found} · ${t("documents.ask.generated", { ms: generateMs, tps: tps.toFixed(1), tokens: prompt.promptTokens })}`);
      onResult?.({ question: text, answer: reply, citations: shown.shown, cited: shown.cited, notFound: isNotFound, retrieveMs, promptTokens: prompt.promptTokens, generateMs, tokPerSec: tps, used });
    } catch (e: unknown) {
      if (summary && ac.signal.aborted) {
        setAnswer("");
        return setPhase({ kind: "idle" });
      }
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
  const names = joinList(i18n.language, docs.map((d) => d.name));
  const insets = useSafeAreaInsets();
  const lift = useKeyboardLift();
  useOpenSheet(true, onClose);
  return (
    <AppModal animationType="slide" onRequestClose={onClose}>
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
          {strictLocked ? <ProTag onPress={() => onUnlock?.("strictDocuments")} /> : null}
          <Toggle testID="ask-strict" label={t("documents.strict.title")} value={strict && !strictLocked} onChange={(v) => { if (strictLocked) return onUnlock?.("strictDocuments"); setStrict(v); library.setStrict(v); }} />
        </View>
        <ScrollView style={styles.answerWrap} contentContainerStyle={styles.answerContent}>
          {phase.kind === "loading" ? <Text style={[styles.mono, { color: theme.text3 }]}>{t("chat.loading", { model: chipLabel(t, model.id) })}</Text> : null}
          {phase.kind === "retrieving" && readingPages ? (
            <Text testID="ask-reading-pages" style={[styles.mono, { color: theme.text3 }]}>
              {readingPages}
            </Text>
          ) : phase.kind === "retrieving" ? (
            <Text style={[styles.mono, { color: theme.text3 }]}>{t("documents.ask.searching")}</Text>
          ) : null}
          {phase.kind === "error" ? <Text style={[styles.body, { color: theme.danger }]}>{t(`documents.error.${phase.error}`, { defaultValue: phase.error })}</Text> : null}
          {notFound ? (
            <Text testID="ask-not-found" style={[styles.body, { color: theme.text }]}>
              {t("documents.notFound")}
            </Text>
          ) : null}
          {answer ? (
            <View style={styles.assistant}>
              <Text style={[styles.label, { color: theme.text3 }]}>{t("chat.modelLabel", { model: chipLabel(t, model.id) })}</Text>
              <Markdown testID="ask-answer" source={answer} direction={directionOf(answer)} caret={phase.kind === "answering"} />
            </View>
          ) : null}
          {phase.kind === "done" && !notFound ? <Citations citations={citations.shown} cited={citations.cited} /> : null}
          {wordsOnly ? (
            <Text testID="ask-lexical" style={[styles.note, { color: theme.text2 }]}>
              {t("documents.wordsOnly")}
            </Text>
          ) : null}
          {noneMatched && !notFound ? (
            <Text testID="ask-none-matched" style={[styles.note, { color: theme.text2 }]}>
              {t("documents.noneMatched")}
            </Text>
          ) : null}
          {reindexLine ? (
            <Text testID={reindexLine.kind === "done" ? "ask-reindexed" : "ask-reindexing"} style={[styles.mono, { color: theme.text3 }]}>
              {reindexLine.kind === "done" ? t("documents.reindexDone") : t("documents.reindexing", reindexLine)}
            </Text>
          ) : null}
          {statsLine ? (
            <Text testID="ask-stats" style={[styles.mono, { color: theme.text3 }]}>
              {statsLine}
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
    </AppModal>
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
  note: { ...font("sans"), fontSize: 13, lineHeight: 19 },
  composer: { flexDirection: "row", alignItems: "center", margin: 12, borderWidth: 1, borderRadius: radius.card, paddingLeft: 12 },
  input: { flex: 1, ...font("sans"), fontSize: 16, minHeight: 44, paddingVertical: 10 },
  btn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", margin: 4 },
  stopText: { ...font("sans", "500"), fontSize: 12 },
  sendGlyph: { fontSize: 18 },
});
