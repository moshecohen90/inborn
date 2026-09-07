import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, FlatList, Image, KeyboardAvoidingView, Pressable, StyleSheet, Text, View, type NativeScrollEvent, type NativeSyntheticEvent, type TextInput } from "react-native";
import { useFocusEffect } from "expo-router";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getLocales } from "expo-localization";
import { Icon, compactChrome, radius } from "@inborn/ui";
import {
  BUILT_IN_PERSONAS,
  DEFAULT_PERSONA_ID,
  NOT_FOUND_TOKEN,
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
  limits,
  markdownToText,
  paywallFor,
  planSummary,
  scriptOf,
  titleFromFirstMessage,
  type Chat as ChatRecord,
  type ChatMessage,
  type ChatStore,
  type Citation,
  type CrisisResource,
  type Message,
  type Persona,
  type ReportInput,
  type Session,
  type StoppedBy,
  type Usage,
  reportText,
} from "@inborn/core";
import { enableVision, getEngine, loadSession, wasStoppedByGuard } from "../engine";
import { writeDevResult } from "../adapters/devModel";
import { File, Paths } from "expo-file-system";
import { DEV_AUTOVOICE, DEV_AUTOVOICE_TTS, getWhisper, isSpeaking, speak, stopSpeaking, useDictation, whisperInstalled } from "../voice";
import { modelHasVision, pickImages, removeImage, resolveVision, visionInstalled, type PickedImage } from "../images";
import { languageName as localeLabel } from "./Settings/Settings";
import { Seal, type SealState } from "../components/Seal";
import { AssistantMessage, type AssistantRow } from "../components/chat/AssistantMessage";
import { UserMessage } from "../components/chat/UserMessage";
import { Composer } from "../components/chat/Composer";
import { AttachSheet } from "../components/chat/AttachSheet";
import { TemplatesSheet } from "../work";
import { ContextMeter } from "../components/chat/ContextMeter";
import { ChromeBar, FloatingToolbar, liquidGlass } from "../components/shell/NativeChrome";
import { ChipGlyph } from "../components/shell/ChipGlyph";
import { ChatSettingsSheet, type ChatSettings } from "../components/chat/ChatSettingsSheet";
import { ReportSheet } from "../components/chat/ReportSheet";
import { SafetyCard } from "../components/chat/SafetyCard";
import { ProTag, Sheet, SheetItem } from "../components/chat/Sheet";
import { shape } from "../components/chat/styles";
import { useType } from "../services/type";
import { copyText } from "../lib/clipboard";
import { shareFile } from "../lib/share";
import { useEntitlements } from "../lib/entitlements";
import { modelLabel } from "../lib/models";
import { useShortcut } from "../lib/shortcuts";
import { useFontScale, useTheme } from "../lib/theme";
import { useEntitlement } from "../licence";
import { RAM_ATTACH_PREFIX, useDocumentContext, useDocuments } from "../documents";
import { deviceNoun } from "../lib/deviceNoun";

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
  /** Persona for a chat that does not exist yet (chosen in the new-chat sheet). */
  personaId?: string;
  /** Desktop menu / hardware keyboard (§14.4): ⌘N / ⇧⌘I land here when this screen is the one in front. */
  onNewChat?: (incognito: boolean, personaId?: string) => void;
  /** "Manage documents" in the attach sheet → S40. */
  onOpenDocuments?: () => void;
  /** Value moments (§12.3): the mic, "remember this", the PRO tags. */
  onOpenPaywall?: () => void;
  /** Companions live in the vault (whisper, the vision projector). */
  onOpenVault?: () => void;
  /** S44 hands-free voice mode (Pro). */
  onOpenVoice?: (chatId: string | null, incognito: boolean) => void;
  /** The shell's seal state ("loading" while the first model pack is still arriving, §8.8). */
  sealState?: SealState;
  sealProgress?: number;
}

/* Android freezes when one Modal opens in the frame another one dismisses; hand over after the 280 ms sheet animation. */
export const afterSheetClose = (fn: () => void) => setTimeout(fn, 320);

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const wire = (rows: readonly Row[]): Pick<ChatMessage, "id" | "role" | "content" | "images">[] => rows.filter((r) => !r.streaming && !r.error).map(({ id, role, content, images }) => ({ id, role, content, ...(images?.length ? { images } : {}) }));
const toMessage = ({ role, content, images }: Pick<ChatMessage, "role" | "content" | "images">): Message => ({ role, content, ...(images?.length ? { images } : {}) });

export function Chat({ store, chatId, incognito, onOpenChats, onChatCreated, personaId, onNewChat, onOpenDocuments, onOpenPaywall, onOpenVault, onOpenVoice, sealState, sealProgress }: ChatProps) {
  const type = useType();
  const fontScale = useFontScale();
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const ent = useEntitlements();
  const { tier } = useEntitlement();
  const { engine, model } = getEngine();
  const inputRef = useRef<TextInput | null>(null);
  const focused = useRef(true);
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
  const [settings, setSettings] = useState<ChatSettings>({ personaId: personaId ?? DEFAULT_PERSONA_ID, systemPrompt: "", thinking: false });
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
  const [attachOpen, setAttachOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [micOpen, setMicOpen] = useState(false);
  const [preferWhisper, setPreferWhisper] = useState(false);
  const [pendingImages, setPendingImages] = useState<PickedImage[]>([]);
  const [readingId, setReadingId] = useState<string | null>(null);
  const dictation = useDictation({ draft, setDraft, tier, locale: i18n.language, preferWhisper });
  /* Attachments key by chat id; a chat that does not exist yet, and every incognito chat, attach under a RAM-only key (§5.7). */
  const draftKey = useRef(`${RAM_ATTACH_PREFIX}draft-${Date.now().toString(36)}`).current;
  const [docKey, setDocKey] = useState<string>(chatId ? (incognito ? `${RAM_ATTACH_PREFIX}${chatId}` : chatId) : draftKey);
  const docs = useDocumentContext(docKey);
  const { library, state: libraryState } = useDocuments();
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
    void library.ready();
  }, [library]);
  // RAM-only attachments end with the screen; a persistent chat keeps its list in documents.json.
  useEffect(() => () => void (docKey.startsWith(RAM_ATTACH_PREFIX) && library.detachAll(docKey)), [docKey, library]);
  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      return () => {
        focused.current = false;
      };
    }, []),
  );

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

  // Desktop menu accelerators (§8.9, §14.4); the chats drawer answers them itself while it is up, so only the front screen acts.
  useShortcut("stop", () => {
    if (!focused.current) return;
    stopReason.current = "user";
    abort.current?.abort();
  });
  useShortcut("search", () => focused.current && onOpenChats());
  useShortcut("continue", () => {
    if (!focused.current || busy) return;
    const last = [...rowsRef.current].reverse().find((r) => r.role === "assistant");
    if (last?.stopped && !last.streaming) void continueRow(last);
  });
  useShortcut("new-chat", () => focused.current && onNewChat?.(false));
  useShortcut("toggle-incognito", () => focused.current && onNewChat?.(!incognito));
  useShortcut("focus-composer", () => focused.current && inputRef.current?.focus());

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
    const key = incognito ? `${RAM_ATTACH_PREFIX}${id}` : id;
    library.moveAttachments(draftKey, key);
    setDocKey(key);
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
    let citations: Citation[] | undefined;
    const started = Date.now();
    const patch = (fn: (r: Row) => Row) => setRows((all) => all.map((x) => (x.id === targetId ? fn(x) : x)));
    try {
      const facts = await store.memoryFor(chatIdNow, persona.id);
      const lastUserAt = history.map((m) => m.role).lastIndexOf("user");
      const lastUser = lastUserAt >= 0 ? history[lastUserAt]!.content : "";
      const system = composeSystemPrompt({ baseline: SAFETY_BASELINE, persona, chatPrompt: settings.systemPrompt, memory: facts, languageHint: languageHint(lastUser) });
      const prompt = buildPrompt({ system, summary: chat?.summary, summaryUpTo: chat?.summaryUpTo, messages: history.map((m, i) => ({ id: String(i), ...m })), nCtx, scale: tokenScale });
      let messages = prompt.messages;
      /* Attached documents (§7.3, §8.5): retrieve, fence, cite; "Continue" keeps the passages the partial answer already saw. */
      if (docs.ready && !existingMessageId && lastUser) {
        try {
          const rag = await docs.buildPrompt(lastUser, history.slice(0, lastUserAt), nCtx, system);
          if (rag.prompt.noAnswer) {
            const saved = await store.appendMessage({ chatId: chatIdNow, role: "assistant", content: t("documents.notFound"), modelId: model.id });
            setRows((all) => all.map((x) => (x.id === targetId ? saved : x)));
            return;
          }
          messages = rag.prompt.messages;
          citations = rag.prompt.citations;
        } catch (e: unknown) {
          flash(t(`documents.error.${errorText(e)}`, { defaultValue: errorText(e) }));
        }
      }
      const opts = { reasoning: thinkingAvailable && settings.thinking, ...(persona.temperature !== undefined ? { temperature: persona.temperature } : {}) };
      /* Photos in the prompt (§7.1): attach the projector once per resident model; without it the text still goes through. */
      if (messages.some((m) => m.images?.length)) {
        const mmproj = resolveVision();
        if (!mmproj || !(await enableVision(mmproj))) flash(t("chat.attach.visionMissing", { size: "205 MB" }));
      }
      for await (const d of engine.generate(s, messages, opts, ac.signal)) {
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
      /* The guard aborts through its own controller (background grace on Android, heat, memory): still a system stop with "Continue". */
      const guardStopped = wasStoppedByGuard();
      const stopped = ac.signal.aborted || guardStopped;
      const stoppedBy: StoppedBy | undefined = stopped ? (reason === "system" || guardStopped ? "system" : "user") : undefined;
      if (usage && !citations) setTokenScale((prev) => calibrate(prompt.used, usage!.promptTokens, prev));
      if (citations && reply.trim().startsWith(NOT_FOUND_TOKEN)) {
        reply = t("documents.notFound");
        citations = undefined;
        patch((x) => ({ ...x, content: prefix + reply }));
      }
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
          ...(citations?.length ? { citations } : {}),
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
      const result = { engine: engine.id, model: model.id, uri: model.uri, loadMs: loadMs.current, ...last, elapsedMs: Date.now() - started, info: "devInfo" in engine ? engine.devInfo : undefined };
      if (__DEV__) console.log("[stats]", JSON.stringify(result));
      if (AUTOPROMPT) writeDevResult({ ...result, reply });
    }
  };

  const submit = async (input: string) => {
    const text = input.trim() || (pendingImages.length ? t("chat.attach.photo") : "");
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
      const images = pendingImages.map((p) => p.uri);
      setPendingImages([]);
      const user = await store.appendMessage({ chatId: chatIdNow, role: "user", content: text, ...(images.length ? { images } : {}) });
      const pendingId = `pending-${Date.now()}`;
      setRows((all) => [...all, user, { id: pendingId, chatId: chatIdNow, role: "assistant", content: "", modelId: model.id, createdAt: Date.now(), streaming: true }]);
      nearBottom.current = true;
      requestAnimationFrame(() => list.current?.scrollToEnd({ animated: true }));
      const history: Message[] = wire(rowsRef.current).map(toMessage);
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
    await generate(id, wire(before).map(toMessage), pendingId, "");
  };

  const continueRow = async (row: Row) => {
    const id = chatRef.current;
    if (!id || busy) return;
    const at = rowsRef.current.findIndex((r) => r.id === row.id);
    const before = wire(rowsRef.current.slice(0, at)).map(toMessage);
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
    const saved = await store.library.saveReport(report);
    setReportRow(null);
    afterSheetClose(() => void shareFile({ filename: "inborn-report.txt", mimeType: "text/plain", body: reportText(saved) }, t("report.email")));
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
  const sealOverride = sealState && sealState !== "sealed" && sealState !== "generating" ? sealState : undefined;
  const sealLabel = sealOverride === "loading" ? t("chat.delivering") : t("chat.sealed");
  const attachedNames = docs.documents.map((d) => d.name);
  const onMic = () => {
    if (readingId) void stopSpeaking().then(() => setReadingId(null));
    dictation.toggle();
  };
  const openVoice = () => {
    setMicOpen(false);
    if (paywallFor(tier, { kind: "feature", feature: "voiceConversation" })) return afterSheetClose(() => onOpenPaywall?.());
    afterSheetClose(() => onOpenVoice?.(chatRef.current, incognito));
  };
  const useWhisper = () => {
    setMicOpen(false);
    if (paywallFor(tier, { kind: "feature", feature: "whisperDictation" })) return afterSheetClose(() => onOpenPaywall?.());
    setPreferWhisper(true);
    afterSheetClose(() => dictation.toggle());
  };
  const readAloud = (row: Row) => {
    setActionRow(null);
    if (readingId === row.id && isSpeaking()) {
      void stopSpeaking().then(() => setReadingId(null));
      return;
    }
    setReadingId(row.id);
    afterSheetClose(() => void speak(markdownToText(row.content), { uiLocale: i18n.language, onDone: () => setReadingId((r) => (r === row.id ? null : r)), onError: () => setReadingId(null) }));
  };
  const visionReady = visionInstalled();
  const modelSees = modelHasVision(model.id);
  const imageLimit = limits(tier).imagesPerMessage;
  const addPhoto = (source: "library" | "camera") => {
    setAttachOpen(false);
    const room = imageLimit - pendingImages.length;
    if (room <= 0) return afterSheetClose(() => (tier === "free" ? onOpenPaywall?.() : undefined));
    /* iOS refuses to present the picker while the sheet's modal is still dismissing. */
    afterSheetClose(() => {
      void pickImages(source, room).then((r) => {
        if (r.ok) setPendingImages((p) => [...p, ...r.images]);
        else if (r.reason === "permission") flash(t("chat.image.permission"));
        else if (r.reason === "failed") flash(t("chat.image.failed"));
      });
    });
  };
  const dropPhoto = (uri: string) => {
    setPendingImages((p) => p.filter((x) => x.uri !== uri));
    removeImage(uri);
  };
  const micPhase = dictation.phase.kind;
  const micLine = micPhase === "listening" ? t("voice.listeningHint") : micPhase === "transcribing" ? t("voice.transcribingHint") : null;

  /* Headless voice proof (dev bundles only): whisper over WAVs pushed into Documents, TTS latency, numbers → dev-run.json. */
  useEffect(() => {
    if (!DEV_AUTOVOICE.length || status.kind !== "ready") return;
    let alive = true;
    void (async () => {
      const results: Record<string, unknown>[] = [];
      let whisperLoadMs = 0;
      try {
        await getWhisper().load();
        whisperLoadMs = getWhisper().loadMs;
        for (const name of DEV_AUTOVOICE) {
          const r = await getWhisper().transcribeFile(new File(Paths.document, name).uri);
          results.push({ file: name, ...r });
          if (!alive) return;
        }
        let ttsStartMs: number | undefined;
        if (DEV_AUTOVOICE_TTS && results[0]) {
          const started = Date.now();
          await speak(String(results[0].text), { uiLocale: i18n.language, onStart: () => (ttsStartMs = Date.now() - started) });
        }
        writeDevResult({ voice: { whisperLoadMs, whisperInstalled: whisperInstalled(), results, ttsStartMs } });
      } catch (e: unknown) {
        writeDevResult({ voice: { whisperLoadMs, error: errorText(e), results } });
      }
    })();
    return () => {
      alive = false;
    };
  }, [status.kind]);

  const [topH, setTopH] = useState(0);
  const [bottomH, setBottomH] = useState(0);
  useEffect(() => {
    if (liquidGlass && bottomH && nearBottom.current) list.current?.scrollToEnd({ animated: false });
  }, [bottomH]);
  const top = (
    <>
      <FloatingToolbar style={styles.header}>
        <Pressable testID="open-chats" accessibilityRole="button" onPress={onOpenChats} hitSlop={8} style={styles.headerBtn}>
          <Text style={[type.body, { color: theme.text2 }]}>{t("chats.title")}</Text>
        </Pressable>
        <View style={styles.sealWrap}>
          <Seal size={28} color={theme.sealed} glow={theme.accent} state={sealOverride} progress={sealProgress} generating={busy || summarizing} label={sealLabel} />
          {compactChrome(fontScale * type.scale) ? null : (
            <Text testID="seal-label" numberOfLines={1} style={[type.monoLabel, styles.sealLabel, { color: theme.sealed }]}>
              {busy && liveTps > 0 ? t("chat.liveTps", { tps: liveTps.toFixed(0) }) : sealLabel}
            </Text>
          )}
        </View>
        <Pressable testID="model-chip" accessibilityRole="button" accessibilityLabel={t("chatSettings.title")} onPress={() => setSettingsOpen(true)} style={[shape.chip, styles.modelChip, { backgroundColor: theme.surface2, borderColor: theme.border }]}>
          {incognito ? <Icon name="incognito" size={14} color={theme.text2} /> : <ChipGlyph size={12} color={theme.text2} />}
          <Text numberOfLines={1} style={[type.monoLabel, styles.modelChipText, { color: theme.text2 }]}>
            {modelLabel(model.id)}
          </Text>
        </Pressable>
      </FloatingToolbar>
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
          <Text style={[type.caption, styles.grow, { color: theme.text2 }]}>{t("chat.canBeWrong", { device: deviceNoun() })}</Text>
          <Pressable accessibilityRole="button" onPress={dismissNotice} hitSlop={8} style={styles.noticeBtn}>
            <Text style={[type.caption, { color: theme.accent }]}>{t("safety.dismiss")}</Text>
          </Pressable>
        </View>
      ) : null}
    </>
  );
  const bottom = (
    <>
      {level === "full" ? (
        <View testID="context-banner" style={[styles.banner, { backgroundColor: theme.surface1, borderColor: theme.accent }]}>
          <Text style={[type.bodySmall, styles.bannerText, { color: theme.text }]}>{t("chat.contextFull")}</Text>
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
      {micLine ? (
        <Text testID="mic-line" style={[type.caption, styles.centered, { color: theme.accent }]}>
          {micLine}
        </Text>
      ) : null}
      {pendingImages.length ? (
        <View testID="pending-images" style={styles.chips}>
          {pendingImages.map((p, i) => (
            <Pressable key={p.uri} testID={`pending-image-${i}`} accessibilityRole="button" accessibilityLabel={t("chat.image.remove", { n: i + 1 })} onPress={() => dropPhoto(p.uri)} style={[styles.thumbWrap, { borderColor: theme.accent }]}>
              <Image source={{ uri: p.uri }} style={styles.thumb} resizeMode="cover" />
              <View style={[styles.thumbX, { backgroundColor: theme.bg }]}>
                <Icon name="x" size={12} color={theme.text} />
              </View>
            </Pressable>
          ))}
          {tier === "free" ? <Text style={[type.monoLabel, styles.strictTag, { color: theme.text3 }]}>{t("chat.attach.photoLimit")}</Text> : null}
        </View>
      ) : null}
      {attachedNames.length ? (
        <View testID="attached-docs" style={styles.chips}>
          {docs.documents.map((d) => (
            <Pressable key={d.id} testID={`attached-chip-${d.id}`} accessibilityRole="button" accessibilityLabel={t("chat.attach.detach", { name: d.name })} onPress={() => docs.detach(d.id)} style={[shape.chip, styles.docChip, { backgroundColor: theme.surface2, borderColor: theme.accent }]}>
              <Icon name="paperclip" size={12} color={theme.accent} />
              <Text numberOfLines={1} style={[type.caption, styles.docChipText, { color: theme.text }]}>
                {d.name}
              </Text>
              <Icon name="x" size={12} color={theme.text3} />
            </Pressable>
          ))}
          {docs.strict ? <Text style={[type.monoLabel, styles.strictTag, { color: theme.text3 }]}>{t("chat.attach.strict")}</Text> : null}
        </View>
      ) : null}
      <ContextMeter fullness={budget.fullness} />
      <Composer
        inputRef={inputRef}
        onAttach={() => setAttachOpen(true)}
        attachedCount={attachedNames.length}
        onMic={onMic}
        onMicLongPress={() => setMicOpen(true)}
        mic={micPhase}
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
    </>
  );

  return (
    // Edge-to-edge Android does not resize the window for the keyboard, so the screen pads itself (§9.6 anchored composer).
    <KeyboardAvoidingView behavior="padding" style={[styles.root, { backgroundColor: incognito ? theme.well : theme.bg, paddingTop: liquidGlass ? 0 : insets.top + 8, paddingBottom: insets.bottom }]}>
      {/* Glass only reads as glass with content moving under it (§9.7): on iOS 26 both bars float over the list, which pads itself by their measured heights. */}
      {liquidGlass ? null : top}
      <FlatList
        ref={list}
        data={rows}
        keyExtractor={(r) => r.id}
        contentContainerStyle={[styles.list, liquidGlass ? { paddingTop: topH + 8, paddingBottom: bottomH + 8 } : null]}
        onScroll={onScroll}
        scrollEventThrottle={64}
        keyboardShouldPersistTaps="handled"
        /* Pinning index 0 while the list is empty would cancel the bar inset: the padding grows, the empty view moves up, and iOS scrolls it back under the composer (QA B10). */
        maintainVisibleContentPosition={rows.length ? { minIndexForVisible: 0 } : undefined}
        onContentSizeChange={() => {
          if (busy && nearBottom.current) list.current?.scrollToEnd({ animated: false });
        }}
        ListHeaderComponent={safety ? <SafetyCard resources={safety} onDismiss={() => setSafety(null)} /> : null}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Seal size={72} color={theme.sealed} glow={theme.accent} state={sealOverride} progress={sealProgress} generating={false} label={sealLabel} />
            <Text style={[type.monoLabel, { color: theme.text3 }]}>{modelLabel(model.id)}</Text>
            <Text testID="empty-headline" style={[type.title, styles.headline, { color: theme.text }]}>
              {incognito ? t("chat.incognito.headline") : t("onboarding.headline", { device: deviceNoun() })}
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
      {liquidGlass ? null : bottom}
      {liquidGlass ? (
        <ChromeBar style={[styles.overlayTop, { paddingTop: insets.top + 8 }]} onLayout={(e) => setTopH(e.nativeEvent.layout.height)}>
          {top}
        </ChromeBar>
      ) : null}
      {liquidGlass ? (
        <ChromeBar style={styles.overlayBottom} onLayout={(e) => setBottomH(e.nativeEvent.layout.height)}>
          {bottom}
        </ChromeBar>
      ) : null}

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
            {actionRow.role === "assistant" ? <SheetItem testID="action-read" label={readingId === actionRow.id ? t("chat.readAloud.stop") : t("chat.readAloud")} onPress={() => readAloud(actionRow)} /> : null}
            {!incognito ? (
              <SheetItem
                testID="action-remember"
                label={t("chat.remember")}
                hint={t("chat.rememberHint")}
                trailing={ent.pro ? undefined : <ProTag onPress={() => {
                  setActionRow(null);
                  afterSheetClose(() => onOpenPaywall?.());
                }} />}
                onPress={() => {
                  const id = chatRef.current;
                  const row = actionRow;
                  setActionRow(null);
                  if (!ent.pro) {
                    afterSheetClose(() => onOpenPaywall?.());
                    return;
                  }
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
      <AttachSheet
        visible={attachOpen}
        onClose={() => setAttachOpen(false)}
        documents={libraryState.documents}
        attachedIds={docs.context.docIds}
        strict={docs.strict}
        onSetStrict={docs.setStrict}
        onAttach={docs.attach}
        onDetach={docs.detach}
        onManage={() => {
          setAttachOpen(false);
          afterSheetClose(() => onOpenDocuments?.());
        }}
        onPhoto={addPhoto}
        onTemplates={() => {
          setAttachOpen(false);
          afterSheetClose(() => setTemplatesOpen(true));
        }}
        photoDisabled={!visionReady || !modelSees}
        photoNote={!modelSees ? t("chat.attach.noVision", { model: modelLabel(model.id) }) : !visionReady ? t("chat.attach.visionMissing", { size: "205 MB" }) : tier === "free" ? t("chat.attach.photoFree") : undefined}
      />
      <TemplatesSheet visible={templatesOpen} onClose={() => setTemplatesOpen(false)} onInsert={(text) => setDraft((d) => (d.trim() ? `${d}\n\n${text}` : text))} />
      <Sheet visible={micOpen} onClose={() => setMicOpen(false)} title={t("voice.mic.title")} testID="mic-sheet" scroll={false}>
        <SheetItem
          testID="mic-dictate"
          label={t("voice.mic.dictate")}
          hint={t("voice.mic.dictateHint")}
          onPress={() => {
            setMicOpen(false);
            setPreferWhisper(false);
            afterSheetClose(() => dictation.toggle());
          }}
        />
        <SheetItem testID="mic-whisper" label={t("voice.mic.whisper")} hint={t("voice.mic.whisperHint")} trailing={ent.pro ? undefined : <ProTag onPress={useWhisper} />} onPress={useWhisper} />
        <SheetItem testID="mic-conversation" label={t("voice.mic.conversation")} hint={t("voice.mic.conversationHint")} trailing={ent.pro ? undefined : <ProTag onPress={openVoice} />} onPress={openVoice} />
      </Sheet>
      <Sheet visible={dictation.problem !== null} onClose={dictation.clearProblem} testID="mic-problem" scroll={false}>
        {dictation.problem?.kind === "permission" ? (
          <View style={styles.problem}>
            <Text style={[type.body, type.strong, { color: theme.text }]}>{t("voice.permission.title")}</Text>
            <Text style={[type.bodySmall, { color: theme.text2 }]}>{t("voice.permission.body")}</Text>
          </View>
        ) : dictation.problem?.kind === "offline-missing" ? (
          <>
            <View style={styles.problem}>
              <Text style={[type.body, type.strong, { color: theme.text }]}>{t("voice.offlineMissing.title", { language: localeLabel(dictation.problem.locale) })}</Text>
              <Text style={[type.bodySmall, { color: theme.text2 }]}>{t("voice.offlineMissing.body")}</Text>
            </View>
            {dictation.problem.canInstall ? <SheetItem testID="mic-install-offline" label={t("voice.offlineMissing.install")} onPress={() => void dictation.installOffline(dictation.problem?.kind === "offline-missing" ? dictation.problem.locale : i18n.language)} /> : null}
            <SheetItem
              testID="mic-use-whisper"
              label={t("voice.offlineMissing.whisper")}
              trailing={dictation.problem.whisperIsPro ? <ProTag onPress={() => { dictation.clearProblem(); afterSheetClose(() => onOpenPaywall?.()); }} /> : undefined}
              onPress={() => {
                const pro = dictation.problem?.kind === "offline-missing" && dictation.problem.whisperIsPro;
                dictation.clearProblem();
                if (pro) return afterSheetClose(() => onOpenPaywall?.());
                if (!whisperInstalled()) return afterSheetClose(() => onOpenVault?.());
                setPreferWhisper(true);
                afterSheetClose(() => dictation.toggle());
              }}
            />
          </>
        ) : dictation.problem?.kind === "whisper-missing" ? (
          <>
            <View style={styles.problem}>
              <Text style={[type.body, type.strong, { color: theme.text }]}>{t("voice.whisperMissing.title")}</Text>
              <Text style={[type.bodySmall, { color: theme.text2 }]}>{t("voice.whisperMissing.body")}</Text>
            </View>
            <SheetItem
              testID="mic-open-vault"
              label={t("voice.openVault")}
              onPress={() => {
                dictation.clearProblem();
                afterSheetClose(() => onOpenVault?.());
              }}
            />
          </>
        ) : dictation.problem?.kind === "unsupported" ? (
          <View style={styles.problem}>
            <Text style={[type.bodySmall, { color: theme.text2 }]}>{t("voice.unsupported")}</Text>
          </View>
        ) : dictation.problem?.kind === "error" ? (
          <View style={styles.problem}>
            <Text style={[type.bodySmall, { color: theme.danger }]}>{t("voice.error", { message: dictation.problem.message })}</Text>
          </View>
        ) : null}
      </Sheet>
      <ChatSettingsSheet visible={settingsOpen} onClose={() => setSettingsOpen(false)} value={settings} onSave={(next) => void saveSettings(next)} customPersonas={customPersonas} modelId={model.id} thinkingAvailable={thinkingAvailable} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, minHeight: 44, gap: 8 },
  /* SC-1: the model name never truncates; at large text sizes the seal label (already told by the ring) gives way first. */
  modelChip: { flexDirection: "row", gap: 6, flexShrink: 0 },
  modelChipText: { flexShrink: 0 },
  sealLabel: { flexShrink: 1 },
  overlayTop: { position: "absolute", top: 0, left: 0, right: 0 },
  overlayBottom: { position: "absolute", bottom: 0, left: 0, right: 0 },
  headerBtn: { minWidth: 44, minHeight: 44, justifyContent: "center" },
  sealWrap: { flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 1 },
  centered: { textAlign: "center", paddingTop: 4, paddingHorizontal: 16 },
  notice: { flexDirection: "row", alignItems: "center", gap: 12, marginHorizontal: 16, marginTop: 6, paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth },
  noticeBtn: { minHeight: 28, justifyContent: "center" },
  grow: { flex: 1 },
  list: { padding: 16, gap: 14, flexGrow: 1, justifyContent: "flex-end" },
  empty: { alignItems: "center", gap: 12, marginBottom: 32 },
  headline: { textAlign: "center" },
  suggestions: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8, marginTop: 8 },
  suggestion: { minHeight: 36, paddingHorizontal: 14 },
  banner: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 12, marginHorizontal: 12, marginBottom: 8, padding: 12, borderWidth: 1, borderRadius: radius.control },
  /* At large text sizes the button drops under the text instead of squeezing it to one word per line. */
  bannerText: { flexGrow: 1, flexBasis: 180 },
  chips: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingBottom: 4 },
  docChip: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 30, maxWidth: 220 },
  docChipText: { flexShrink: 1 },
  strictTag: { paddingHorizontal: 4 },
  thumbWrap: { width: 64, height: 64, borderRadius: 10, borderWidth: 1, overflow: "hidden" },
  thumb: { width: "100%", height: "100%" },
  thumbX: { position: "absolute", top: 2, right: 2, width: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center", opacity: 0.9 },
  problem: { paddingHorizontal: 16, paddingVertical: 10, gap: 6 },
});
