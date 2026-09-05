import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, FlatList, Pressable, StyleSheet, Text, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getLocales } from "expo-localization";
import { radius } from "@inborn/ui";
import {
  BUILT_IN_PERSONAS,
  DEFAULT_PERSONA_ID,
  SAFETY_BASELINE,
  buildPrompt,
  calibrate,
  composeSystemPrompt,
  contextLevel,
  crisisResources,
  detectCrisis,
  detectLoop,
  findPersona,
  languageHint,
  markdownToText,
  planSummary,
  scriptOf,
  titleFromFirstMessage,
  type Chat as ChatRecord,
  type ChatMessage,
  type ChatStore,
  type CrisisResource,
  type Message,
  type Persona,
  type ReportInput,
  type Session,
  type StoppedBy,
  type Usage,
} from "@inborn/core";
import { getEngine, loadSession } from "../engine";
import { writeDevResult } from "../adapters/devModel";
import { Seal } from "../components/Seal";
import { AssistantMessage, type AssistantRow } from "../components/chat/AssistantMessage";
import { UserMessage } from "../components/chat/UserMessage";
import { Composer } from "../components/chat/Composer";
import { ContextMeter } from "../components/chat/ContextMeter";
import { ChatSettingsSheet, type ChatSettings } from "../components/chat/ChatSettingsSheet";
import { ReportSheet } from "../components/chat/ReportSheet";
import { SafetyCard } from "../components/chat/SafetyCard";
import { ProTag, Sheet, SheetItem } from "../components/chat/Sheet";
import { shape, type } from "../components/chat/styles";
import { copyText } from "../lib/clipboard";
import { shareFile } from "../lib/share";
import { useEntitlements } from "../lib/entitlements";
import { modelLabel } from "../lib/models";
import { takeNewChatIntent } from "../lib/newChatIntent";
import { useTheme } from "../lib/theme";

type Row = AssistantRow;
type Status = { kind: "loading" } | { kind: "ready" } | { kind: "error"; error: string };

/* Headless device runs (USB, nothing can tap the screen): bundling with EXPO_PUBLIC_AUTOPROMPT=1 sends one prompt 2 s after the model loads and writes the numbers to Documents/dev-run.json; any other value is sent verbatim (emulators cannot type non-ASCII). Store builds never set it. */
const AUTOPROMPT_ENV = process.env.EXPO_PUBLIC_AUTOPROMPT ?? "";
const AUTOPROMPT = AUTOPROMPT_ENV === "1" ? "Explain in about 150 words why the sky is blue." : AUTOPROMPT_ENV.length > 1 ? AUTOPROMPT_ENV : null;
/** Product ceiling for finishing a reply after the app goes to the background (§10.3 #21). */
const BACKGROUND_GRACE_MS = 15_000;
const NOTICE_KEY = "notice.canBeWrong";
const SUGGESTIONS = ["summarize", "translate", "draft"] as const;

export interface ChatProps {
  store: ChatStore;
  /** Null until the first message creates the chat. */
  chatId: string | null;
  incognito: boolean;
  onOpenChats: () => void;
  onChatCreated: (chatId: string) => void;
  /** Persona for a chat that does not exist yet (additive; falls back to the new-chat intent set by Chats). */
  personaId?: string;
}

/* Android freezes when one Modal opens in the frame another one dismisses; hand over after the 280 ms sheet animation. */
export const afterSheetClose = (fn: () => void) => setTimeout(fn, 320);

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const wire = (rows: readonly Row[]): Pick<ChatMessage, "id" | "role" | "content">[] => rows.filter((r) => !r.streaming && !r.error).map(({ id, role, content }) => ({ id, role, content }));

export function Chat({ store, chatId, incognito, onOpenChats, onChatCreated, personaId }: ChatProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const ent = useEntitlements();
  const { engine, model } = getEngine();
  const session = useRef<Session | null>(null);
  const abort = useRef<AbortController | null>(null);
  const stopReason = useRef<StoppedBy | "loop" | null>(null);
  const chatRef = useRef<string | null>(chatId);
  const list = useRef<FlatList<Row>>(null);
  const nearBottom = useRef(true);
  const loadMs = useRef(0);
  const rowsRef = useRef<Row[]>([]);
  const [status, setStatus] = useState<Status>({ kind: "loading" });
  const [rows, setRowsState] = useState<Row[]>([]);
  const [chat, setChat] = useState<ChatRecord | null>(null);
  const [settings, setSettings] = useState<ChatSettings>({ personaId: personaId ?? takeNewChatIntent()?.personaId ?? DEFAULT_PERSONA_ID, systemPrompt: "", thinking: false });
  const [customPersonas, setCustomPersonas] = useState<Persona[]>([]);
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [liveTps, setLiveTps] = useState(0);
  const [tokenScale, setTokenScale] = useState(1);
  const [summarizing, setSummarizing] = useState(false);
  const [actionRow, setActionRow] = useState<Row | null>(null);
  const [reportRow, setReportRow] = useState<ChatMessage | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [safety, setSafety] = useState<CrisisResource[] | null>(null);
  const [notice, setNotice] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const nCtx = session.current?.nCtx ?? 4096;
  const thinkingAvailable = model.id !== "instant";
  const setRows = useCallback((update: Row[] | ((r: Row[]) => Row[])) => {
    rowsRef.current = typeof update === "function" ? update(rowsRef.current) : update;
    setRowsState(rowsRef.current);
  }, []);
  const persona = useMemo(() => findPersona(settings.personaId, customPersonas) ?? BUILT_IN_PERSONAS[0]!, [settings.personaId, customPersonas]);
  const quant = useMemo(() => {
    const info = "devInfo" in engine ? (engine.devInfo as { desc?: string }) : undefined;
    const m = /Q\d[A-Z0-9_]*|F16|BF16|IQ\d[A-Z0-9_]*/i.exec(info?.desc ?? "");
    return m?.[0]?.toUpperCase();
  }, [engine, status.kind]);

  const flash = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 1400);
  };

  useEffect(() => {
    let alive = true;
    const started = Date.now();
    loadSession()
      .then((s) => {
        if (!alive) return;
        loadMs.current = Date.now() - started;
        console.log(`[inborn] ${engine.id} loaded ${model.uri} in ${loadMs.current} ms`);
        session.current = s;
        setStatus({ kind: "ready" });
      })
      .catch((e: unknown) => {
        const error = errorText(e);
        if (AUTOPROMPT) writeDevResult({ engine: engine.id, model: model.id, error });
        if (alive) setStatus({ kind: "error", error });
      });
    return () => {
      alive = false;
      abort.current?.abort();
    };
  }, []);

  // Loads once per mount; App remounts this screen (key) when another chat is opened.
  useEffect(() => {
    let alive = true;
    const id = chatRef.current;
    (async () => {
      const [custom, dismissed] = await Promise.all([store.library.listPersonas(), store.library.getSetting(NOTICE_KEY)]);
      if (!alive) return;
      setCustomPersonas(custom);
      setNotice(dismissed !== "1");
      if (!id) return;
      const [record, messages] = await Promise.all([store.getChat(id), store.listMessages(id)]);
      if (!alive) return;
      if (record) {
        setChat(record);
        setSettings({ personaId: record.personaId ?? DEFAULT_PERSONA_ID, systemPrompt: record.systemPrompt ?? "", thinking: !!record.thinking });
      }
      setRows(messages);
    })().catch((e: unknown) => console.warn("load chat", e));
    return () => {
      alive = false;
    };
  }, [store, setRows]);

  // Background mid-generation (§10.3 #21): finish within the grace window, else stop and keep the partial with "Continue".
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "background" && abort.current) {
        timer = setTimeout(() => {
          stopReason.current = "system";
          abort.current?.abort();
        }, BACKGROUND_GRACE_MS);
      } else if (state === "active" && timer) {
        clearTimeout(timer);
        timer = null;
      }
    });
    return () => {
      sub.remove();
      if (timer) clearTimeout(timer);
    };
  }, []);

  const budget = useMemo(() => {
    const system = composeSystemPrompt({ baseline: SAFETY_BASELINE, persona, chatPrompt: settings.systemPrompt });
    return buildPrompt({ system, summary: chat?.summary, summaryUpTo: chat?.summaryUpTo, messages: wire(rows), nCtx, scale: tokenScale, reserve: 0 });
  }, [rows, chat?.summary, chat?.summaryUpTo, persona, settings.systemPrompt, nCtx, tokenScale]);
  const level = contextLevel(budget.fullness);

  const ensureChat = async (firstText: string): Promise<string> => {
    let id = chatRef.current;
    if (id) return id;
    const created = await store.createChat({
      modelId: model.id,
      incognito,
      title: titleFromFirstMessage(firstText),
      personaId: settings.personaId,
      ...(settings.systemPrompt ? { systemPrompt: settings.systemPrompt } : {}),
      thinking: settings.thinking,
    });
    id = created.id;
    chatRef.current = id;
    setChat(created);
    onChatCreated(id);
    return id;
  };

  /**
   * One generation: streams into `targetId` (a fresh pending row, or an existing partial when continuing).
   * `history` is the wire conversation to send; `prefix` is content already on the target row.
   */
  const generate = async (chatIdNow: string, history: Message[], targetId: string, prefix: string, existingMessageId?: string) => {
    const s = session.current;
    if (!s) return;
    setBusy(true);
    const ac = new AbortController();
    abort.current = ac;
    stopReason.current = null;
    let reply = "";
    let reasoning = "";
    let usage: Usage | undefined;
    let tokens = 0;
    let firstAt = 0;
    let reasoningStart = 0;
    let reasoningMs: number | undefined;
    const started = Date.now();
    const patch = (fn: (r: Row) => Row) => setRows((all) => all.map((x) => (x.id === targetId ? fn(x) : x)));
    try {
      const facts = await store.memoryFor(chatIdNow, persona.id);
      const lastUser = [...history].reverse().find((m) => m.role === "user")?.content ?? "";
      const system = composeSystemPrompt({ baseline: SAFETY_BASELINE, persona, chatPrompt: settings.systemPrompt, memory: facts, languageHint: languageHint(lastUser) });
      const prompt = buildPrompt({ system, summary: chat?.summary, summaryUpTo: chat?.summaryUpTo, messages: history.map((m, i) => ({ id: String(i), ...m })), nCtx, scale: tokenScale });
      const opts = { reasoning: thinkingAvailable && settings.thinking, ...(persona.temperature !== undefined ? { temperature: persona.temperature } : {}) };
      for await (const d of engine.generate(s, prompt.messages, opts, ac.signal)) {
        if (d.reasoning) {
          if (!reasoningStart) reasoningStart = Date.now();
          reasoning += d.reasoning;
          const snapshot = reasoning;
          patch((x) => ({ ...x, reasoning: snapshot }));
        }
        if (d.text) {
          if (!firstAt) {
            firstAt = Date.now();
            if (reasoningStart) reasoningMs = firstAt - reasoningStart;
          }
          reply += d.text;
          tokens++;
          const snapshot = prefix + reply;
          patch((x) => ({ ...x, content: snapshot }));
          if (tokens % 8 === 0) {
            setLiveTps((tokens * 1000) / Math.max(1, Date.now() - firstAt));
            if (tokens >= 24 && detectLoop(reply)) {
              stopReason.current = "loop";
              ac.abort();
            }
          }
        }
        if (d.done) usage = d.done;
      }
      const reason = stopReason.current as StoppedBy | "loop" | null;
      const stopped = ac.signal.aborted;
      const stoppedBy: StoppedBy | undefined = stopped ? (reason === "system" ? "system" : "user") : undefined;
      if (usage) setTokenScale((prev) => calibrate(prompt.used, usage!.promptTokens, prev));
      if (!reply && !reasoning && stopped && !existingMessageId) {
        setRows((all) => all.filter((x) => x.id !== targetId));
      } else if (existingMessageId) {
        await store.updateMessage(chatIdNow, existingMessageId, { content: prefix + reply, stopped: !!stopped, ...(stoppedBy ? { stoppedBy } : {}), ...(usage ? { usage } : {}) });
        patch((x) => ({ ...x, content: prefix + reply, streaming: false, stopped: !!stopped, stoppedBy, loop: reason === "loop", ...(usage ? { usage } : {}) }));
      } else {
        const saved = await store.appendMessage({
          chatId: chatIdNow,
          role: "assistant",
          content: reply,
          modelId: model.id,
          ...(reasoning ? { reasoning } : {}),
          ...(reasoningMs !== undefined ? { reasoningMs } : {}),
          stopped,
          ...(stoppedBy ? { stoppedBy } : {}),
          ...(usage ? { usage } : {}),
        });
        setRows((all) => all.map((x) => (x.id === targetId ? { ...saved, loop: reason === "loop" } : x)));
      }
    } catch (e: unknown) {
      const error = errorText(e);
      patch((x) => ({ ...x, streaming: false, error }));
    } finally {
      abort.current = null;
      setBusy(false);
      setLiveTps(0);
      const last = engine.stats();
      const result = { engine: engine.id, model: model.id, loadMs: loadMs.current, ...last, elapsedMs: Date.now() - started, info: "devInfo" in engine ? engine.devInfo : undefined };
      if (__DEV__) console.log("[stats]", JSON.stringify(result));
      if (AUTOPROMPT) writeDevResult({ ...result, reply });
    }
  };

  const submit = async (input: string) => {
    const text = input.trim();
    if (!text || !session.current || busy) return;
    setDraft("");
    const editing = editingId;
    setEditingId(null);
    if (detectCrisis(text)) setSafety(crisisResources(getLocales()[0]?.regionCode ?? undefined));
    try {
      const chatIdNow = await ensureChat(text);
      if (editing) {
        await store.deleteMessagesFrom(chatIdNow, editing);
        const at = rowsRef.current.findIndex((r) => r.id === editing);
        if (at >= 0) setRows((all) => all.slice(0, at));
        if (chat?.summaryUpTo && !rowsRef.current.some((r) => r.id === chat.summaryUpTo)) setChat((c) => (c ? { ...c, summary: undefined, summaryUpTo: undefined } : c));
      }
      const user = await store.appendMessage({ chatId: chatIdNow, role: "user", content: text });
      const pendingId = `pending-${Date.now()}`;
      setRows((all) => [...all, user, { id: pendingId, chatId: chatIdNow, role: "assistant", content: "", modelId: model.id, createdAt: Date.now(), streaming: true }]);
      nearBottom.current = true;
      requestAnimationFrame(() => list.current?.scrollToEnd({ animated: true }));
      const history: Message[] = wire(rowsRef.current).map(({ role, content }) => ({ role, content }));
      await generate(chatIdNow, history, pendingId, "");
    } catch (e: unknown) {
      flash(errorText(e));
      setBusy(false);
    }
  };
  const send = () => submit(draft);

  const regenerate = async (row: Row) => {
    const id = chatRef.current;
    if (!id || busy) return;
    const at = rowsRef.current.findIndex((r) => r.id === row.id);
    if (at < 0) return;
    if (!row.id.startsWith("pending-")) await store.deleteMessagesFrom(id, row.id);
    const before = rowsRef.current.slice(0, at);
    const pendingId = `pending-${Date.now()}`;
    setRows([...before, { id: pendingId, chatId: id, role: "assistant", content: "", modelId: model.id, createdAt: Date.now(), streaming: true }]);
    await generate(id, wire(before).map(({ role, content }) => ({ role, content })), pendingId, "");
  };

  const continueRow = async (row: Row) => {
    const id = chatRef.current;
    if (!id || busy) return;
    const at = rowsRef.current.findIndex((r) => r.id === row.id);
    const before = wire(rowsRef.current.slice(0, at)).map(({ role, content }) => ({ role, content }));
    const history: Message[] = [...before, { role: "assistant", content: row.content }, { role: "user", content: "Continue exactly where you stopped. Do not repeat what you already wrote." }];
    setRows((all) => all.map((x) => (x.id === row.id ? { ...x, streaming: true, stopped: false, loop: false } : x)));
    await generate(id, history, row.id, row.content, row.id);
  };

  const summarizeAndContinue = async () => {
    const id = chatRef.current;
    const s = session.current;
    if (!id || !s || busy || summarizing) return;
    const plan = planSummary(wire(rows), chat?.summary && chat.summaryUpTo ? { summary: chat.summary, upTo: chat.summaryUpTo } : undefined);
    if (!plan.request.length || !plan.upTo) return;
    setSummarizing(true);
    const ac = new AbortController();
    abort.current = ac;
    let summary = "";
    try {
      for await (const d of engine.generate(s, plan.request, { reasoning: false, maxTokens: 320, temperature: 0.3 }, ac.signal)) if (d.text) summary += d.text;
      summary = summary.trim();
      if (summary) {
        await store.updateChat(id, { summary, summaryUpTo: plan.upTo });
        setChat((c) => (c ? { ...c, summary, summaryUpTo: plan.upTo } : c));
        flash(t("chat.summarized"));
      }
    } catch (e: unknown) {
      flash(errorText(e));
    } finally {
      abort.current = null;
      setSummarizing(false);
    }
  };

  const saveSettings = async (next: ChatSettings) => {
    setSettings(next);
    const id = chatRef.current;
    if (!id) return;
    await store.updateChat(id, { personaId: next.personaId ?? null, systemPrompt: next.systemPrompt || null, thinking: next.thinking });
    setChat((c) => (c ? { ...c, personaId: next.personaId, systemPrompt: next.systemPrompt || undefined, thinking: next.thinking } : c));
  };

  const dismissNotice = () => {
    setNotice(false);
    void store.library.setSetting(NOTICE_KEY, "1");
  };

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    nearBottom.current = contentSize.height - (contentOffset.y + layoutMeasurement.height) < 100;
  };

  const saveReport = async (report: ReportInput) => {
    await store.library.saveReport(report);
  };
  const emailReport = async (report: ReportInput) => {
    const body = [`Inborn report · ${new Date().toISOString()}`, `Reason: ${report.reason}`, report.note ? `Note: ${report.note}` : "", report.modelId ? `Model: ${report.modelId}` : "", report.messageText ? `\nMessage:\n${report.messageText}` : ""].filter(Boolean).join("\n");
    await store.library.saveReport(report);
    setReportRow(null);
    afterSheetClose(() => void shareFile({ filename: "inborn-report.txt", mimeType: "text/plain", body }, t("report.email")));
  };

  useEffect(() => {
    if (!AUTOPROMPT || status.kind !== "ready") return;
    const timer = setTimeout(() => void submit(AUTOPROMPT), 2000);
    return () => clearTimeout(timer);
  }, [status.kind]);

  const lastUserId = [...rows].reverse().find((r) => r.role === "user")?.id;
  const lastAssistant = [...rows].reverse().find((r) => r.role === "assistant");
  const lastUserText = [...rows].reverse().find((r) => r.role === "user")?.content ?? "";
  const wrongScript = (row: Row) => row.role === "assistant" && !!languageHint(lastUserText) && scriptOf(row.content) !== scriptOf(lastUserText);
  const languageName = languageHint(lastUserText).replace(/^The user writes in (\w+).*$/, "$1");
  const personaName = persona.builtIn ? t(`persona.${persona.id.replace("builtin:", "")}`) : persona.name;

  const statusLine = status.kind === "loading" ? t("chat.loading", { model: modelLabel(model.id) }) : status.kind === "error" ? t("chat.loadFailed", { model: modelLabel(model.id), error: status.error }) : null;

  return (
    <View style={[styles.root, { backgroundColor: incognito ? theme.well : theme.bg, paddingTop: insets.top + 8, paddingBottom: insets.bottom }]}>
      <View style={styles.header}>
        <Pressable testID="open-chats" accessibilityRole="button" onPress={onOpenChats} hitSlop={8} style={styles.headerBtn}>
          <Text style={[type.body, { color: theme.text2 }]}>{t("chats.title")}</Text>
        </Pressable>
        <View style={styles.sealWrap}>
          <Seal size={28} color={theme.sealed} glow={theme.accent} generating={busy || summarizing} label={t("chat.sealed")} />
          <Text style={[type.monoLabel, { color: theme.sealed }]}>{busy && liveTps > 0 ? t("chat.liveTps", { tps: liveTps.toFixed(0) }) : t("chat.sealed")}</Text>
        </View>
        <Pressable testID="model-chip" accessibilityRole="button" accessibilityLabel={t("chatSettings.title")} onPress={() => setSettingsOpen(true)} style={[shape.chip, { backgroundColor: theme.surface2, borderColor: theme.border }]}>
          <Text style={[type.monoLabel, { color: theme.text2 }]}>
            {incognito ? "◐" : "▣"} {modelLabel(model.id)}
          </Text>
        </Pressable>
      </View>
      {incognito ? (
        <Text testID="incognito-badge" style={[type.monoLabel, styles.centered, { color: theme.text2 }]}>
          {t("chat.incognito.badge")}
        </Text>
      ) : null}
      {statusLine ? (
        <Text testID="status-line" style={[type.mono, styles.centered, { color: status.kind === "error" ? theme.danger : theme.text3 }]}>
          {statusLine}
        </Text>
      ) : null}
      {persona.disclaimer || settings.personaId !== DEFAULT_PERSONA_ID ? (
        <Text testID="persona-line" style={[type.caption, styles.centered, { color: theme.text3 }]}>
          {personaName}
          {persona.disclaimer ? ` · ${persona.disclaimer}` : ""}
        </Text>
      ) : null}
      {notice && status.kind === "ready" ? (
        <View testID="notice" style={[styles.notice, { borderColor: theme.border }]}>
          <Text style={[type.caption, styles.grow, { color: theme.text2 }]}>{t("chat.canBeWrong")}</Text>
          <Pressable accessibilityRole="button" onPress={dismissNotice} hitSlop={8} style={styles.noticeBtn}>
            <Text style={[type.caption, { color: theme.accent }]}>{t("safety.dismiss")}</Text>
          </Pressable>
        </View>
      ) : null}
      <FlatList
        ref={list}
        data={rows}
        keyExtractor={(r) => r.id}
        contentContainerStyle={styles.list}
        onScroll={onScroll}
        scrollEventThrottle={64}
        keyboardShouldPersistTaps="handled"
        maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
        onContentSizeChange={() => {
          if (busy && nearBottom.current) list.current?.scrollToEnd({ animated: false });
        }}
        ListHeaderComponent={safety ? <SafetyCard resources={safety} onDismiss={() => setSafety(null)} /> : null}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Seal size={72} color={theme.sealed} glow={theme.accent} generating={false} label={t("chat.sealed")} />
            <Text style={[type.monoLabel, { color: theme.text3 }]}>{modelLabel(model.id)}</Text>
            <Text testID="empty-headline" style={[type.title, styles.headline, { color: theme.text }]}>
              {incognito ? t("chat.incognito.headline") : t("onboarding.headline")}
            </Text>
            <View style={styles.suggestions}>
              {SUGGESTIONS.map((s) => (
                <Pressable key={s} testID={`suggestion-${s}`} accessibilityRole="button" onPress={() => setDraft(t(`chat.suggest.${s}.prompt`))} style={[shape.chip, styles.suggestion, { backgroundColor: theme.surface2, borderColor: theme.border }]}>
                  <Text style={[type.bodySmall, { color: theme.text2 }]}>{t(`chat.suggest.${s}`)}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        }
        renderItem={({ item }) =>
          item.role === "user" ? (
            <UserMessage message={item} onLongPress={() => setActionRow(item)} />
          ) : (
            <AssistantMessage row={item} nCtx={nCtx} quant={quant} onLongPress={() => setActionRow(item)} onContinue={item.id === lastAssistant?.id ? () => void continueRow(item) : undefined} onRegenerate={item.id === lastAssistant?.id ? () => void regenerate(item) : undefined} />
          )
        }
      />
      {level === "full" ? (
        <View testID="context-banner" style={[styles.banner, { backgroundColor: theme.surface1, borderColor: theme.accent }]}>
          <Text style={[type.bodySmall, styles.grow, { color: theme.text }]}>{t("chat.contextFull")}</Text>
          <Pressable testID="summarize" accessibilityRole="button" disabled={summarizing || busy} onPress={() => void summarizeAndContinue()} style={[shape.control, { backgroundColor: theme.ctaFill, opacity: summarizing || busy ? 0.5 : 1, minHeight: 36 }]}>
            <Text style={[type.bodySmall, type.strong, { color: theme.ctaText }]}>{summarizing ? t("chat.summarizing") : t("chat.summarizeContinue")}</Text>
          </Pressable>
        </View>
      ) : null}
      {toast ? (
        <Text testID="toast" style={[type.caption, styles.centered, { color: theme.text2 }]}>
          {toast}
        </Text>
      ) : null}
      <ContextMeter fullness={budget.fullness} />
      <Composer
        value={draft}
        onChange={setDraft}
        onSend={send}
        onStop={() => {
          stopReason.current = "user";
          abort.current?.abort();
        }}
        busy={busy || summarizing}
        disabled={status.kind !== "ready"}
        editing={editingId !== null}
        onCancelEdit={() => {
          setEditingId(null);
          setDraft("");
        }}
        placeholder={t("chat.placeholder")}
        incognito={incognito}
      />

      <Sheet visible={actionRow !== null} onClose={() => setActionRow(null)} testID="message-actions" scroll={false}>
        {actionRow ? (
          <>
            <SheetItem
              testID="action-copy"
              label={t("chat.copy")}
              onPress={() => {
                void copyText(actionRow.content);
                setActionRow(null);
                flash(t("chat.copied"));
              }}
            />
            {actionRow.role === "assistant" ? (
              <SheetItem
                testID="action-copy-text"
                label={t("chat.copyPlain")}
                onPress={() => {
                  void copyText(markdownToText(actionRow.content));
                  setActionRow(null);
                  flash(t("chat.copied"));
                }}
              />
            ) : null}
            {actionRow.role === "user" && actionRow.id === lastUserId ? (
              <SheetItem
                testID="action-edit"
                label={t("chat.edit")}
                hint={t("chat.editHint")}
                disabled={busy}
                onPress={() => {
                  setDraft(actionRow.content);
                  setEditingId(actionRow.id);
                  setActionRow(null);
                }}
              />
            ) : null}
            {actionRow.role === "assistant" && actionRow.id === lastAssistant?.id ? (
              <SheetItem
                testID="action-regenerate"
                label={t("chat.regenerate")}
                disabled={busy}
                onPress={() => {
                  const row = actionRow;
                  setActionRow(null);
                  void regenerate(row);
                }}
              />
            ) : null}
            {wrongScript(actionRow) && actionRow.id === lastAssistant?.id ? (
              <SheetItem
                testID="action-answer-in"
                label={t("chat.answerIn", { language: languageName })}
                disabled={busy}
                onPress={() => {
                  setActionRow(null);
                  void submit(`${t("chat.answerIn", { language: languageName })}`);
                }}
              />
            ) : null}
            {actionRow.role === "assistant" ? <SheetItem testID="action-read" label={t("chat.readAloud")} hint={t("chat.comingSoon")} disabled onPress={() => undefined} /> : null}
            {!incognito ? (
              <SheetItem
                testID="action-remember"
                label={t("chat.remember")}
                hint={t("chat.rememberHint")}
                disabled={!ent.pro}
                trailing={ent.pro ? undefined : <ProTag />}
                onPress={() => {
                  const id = chatRef.current;
                  const row = actionRow;
                  setActionRow(null);
                  if (!id) return;
                  void store.remember(id, row.role === "user" ? row.content : markdownToText(row.content).slice(0, 300), persona.id).then(() => flash(t("chat.remembered")));
                }}
              />
            ) : null}
            {actionRow.role === "assistant" ? (
              <SheetItem
                testID="action-report"
                label={t("report.title")}
                onPress={() => {
                  const row = actionRow;
                  setActionRow(null);
                  afterSheetClose(() => setReportRow(row));
                }}
              />
            ) : null}
          </>
        ) : null}
      </Sheet>
      <ReportSheet message={reportRow} onClose={() => setReportRow(null)} onSave={saveReport} onEmail={emailReport} />
      <ChatSettingsSheet visible={settingsOpen} onClose={() => setSettingsOpen(false)} value={settings} onSave={(next) => void saveSettings(next)} customPersonas={customPersonas} modelId={model.id} thinkingAvailable={thinkingAvailable} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, minHeight: 44, gap: 8 },
  headerBtn: { minWidth: 44, minHeight: 44, justifyContent: "center" },
  sealWrap: { flexDirection: "row", alignItems: "center", gap: 8 },
  centered: { textAlign: "center", paddingTop: 4, paddingHorizontal: 16 },
  notice: { flexDirection: "row", alignItems: "center", gap: 12, marginHorizontal: 16, marginTop: 6, paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth },
  noticeBtn: { minHeight: 28, justifyContent: "center" },
  grow: { flex: 1 },
  list: { padding: 16, gap: 14, flexGrow: 1, justifyContent: "flex-end" },
  empty: { alignItems: "center", gap: 12, marginBottom: 32 },
  headline: { textAlign: "center" },
  suggestions: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8, marginTop: 8 },
  suggestion: { minHeight: 36, paddingHorizontal: 14 },
  banner: { flexDirection: "row", alignItems: "center", gap: 12, marginHorizontal: 12, marginBottom: 8, padding: 12, borderWidth: 1, borderRadius: radius.control },
});
