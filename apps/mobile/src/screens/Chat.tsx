import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, AppState, FlatList, Image, Keyboard, Platform, Pressable, StyleSheet, Text, View, findNodeHandle, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent, type TextInput } from "react-native";
import { useFocusEffect, useIsFocused } from "expo-router";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getLocales } from "expo-localization";
import { Icon, compactChrome, radius } from "@inborn/ui";
import {
  BUILT_IN_PERSONAS,
  DEFAULT_PERSONA_ID,
  NOT_FOUND_TOKEN,
  PASTE_OFFER_CHARS,
  PRODUCTS,
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
  languageCodeOf,
  LANGUAGE_NAME_BY_CODE,
  adviseModel,
  betterForLanguage,
  detectLanguage,
  detectUse,
  fileIntake,
  formatModelBytes,
  languageTierOf,
  FIT_LANGUAGES,
  modelShortfall,
  limits,
  markdownToText,
  fallbackPrice,
  paywallFor,
  planAnswerLength,
  planSummary,
  safetyBaseline,
  screenText,
  scriptOf,
  titleFromFirstMessage,
  type Chat as ChatRecord,
  type ChatMessage,
  type ChatStore,
  type Citation,
  type PaywallReason,
  type CrisisResource,
  type Message,
  type Persona,
  type QuickActionId,
  type ReportInput,
  type SafetyMark,
  type Session,
  type SharePayload,
  type StoppedBy,
  type Usage,
  reportText,
  type Delta,
  isNoSpaceError,
} from "@inborn/core";
import { enableVision, getEngine, loadSession, wasStoppedByGuard } from "../engine";
import { writeDevResult } from "../adapters/devModel";
import { File, Paths } from "expo-file-system";
import { devVoiceRecord } from "../voice/devLive";
import { DEV_AUTOVOICE, DEV_AUTOVOICE_DICTATE, DEV_AUTOVOICE_TTS, getWhisper, isSpeaking, speak, stopSpeaking, useDictation, whisperInstalled } from "../voice";
import { imageUri, modelHasVision, pickImages, removeImage, resolveVision, storedImagePath, visionChatModel, visionInstalled, type PickedImage } from "../images";
import { languageName as localeLabel } from "./Settings/Settings";
import { Seal, type SealState } from "../components/Seal";
import { AssistantMessage, type AssistantRow } from "../components/chat/AssistantMessage";
import { UserMessage } from "../components/chat/UserMessage";
import { Composer } from "../components/chat/Composer";
import { chatBlockedByStorage, reportStorageFull } from "../services/storageFull";
import { AttachSheet } from "../components/chat/AttachSheet";
import { TemplatesSheet } from "../work";
import { RedactBar, RedactSheet, moveRedaction, pickIntoLibrary, planLibraryAttach, useRedaction } from "../documents";
import { ContextMeter } from "../components/chat/ContextMeter";
import { ChromeBar, FloatingToolbar, liquidGlass } from "../components/shell/NativeChrome";
import { BannerSpacer } from "../components/shell/bannerInset";
import { ChipGlyph } from "../components/shell/ChipGlyph";
import { ChatSettingsSheet, type ChatSettings } from "../components/chat/ChatSettingsSheet";
import { ModelAdviceCard } from "../components/chat/ModelAdvice";
import { ChatModelSheet } from "../components/chat/ChatModelSheet";
import { adviceToShow } from "../lib/modelAdviceMemory";
import { isDictatedSend } from "../lib/dictatedDraft";
import { listClipping } from "../lib/listClipping";
import { noteGenerationEnded } from "../lib/pausedTurn";
import { PartialAnswerSaver } from "../lib/partialAnswer";
import { planDocsTurn } from "../lib/docsGate";
import { ReportSheet } from "../components/chat/ReportSheet";
import { SafetyCard } from "../components/chat/SafetyCard";
import { ProTag, Sheet, SheetItem } from "../components/chat/Sheet";
import { QuickActionsSheet } from "../components/chat/QuickActionsSheet";
import { finishProcessText } from "../share";
import { shape } from "../components/chat/styles";
import { useType } from "../services/type";
import { copyText } from "../lib/clipboard";
import { shareFile } from "../lib/share";
import { useEntitlements } from "../lib/entitlements";
import { modelLabel, describeLoad } from "../lib/models";
import { getVault } from "../vault/store";
import { useShortcut } from "../lib/shortcuts";
import { COLUMN_WIDTH } from "../lib/layout";
import { setSidebarOpen, useSidebarOpen } from "../lib/sidebar";
import { useWide } from "../lib/useLayout";
import { useKeyboardLift } from "../lib/keyboard";
import { useFontScale, useTheme } from "../lib/theme";
import { afterSheetClose } from "../lib/sheetHandover";
import { useEntitlement, useLicence } from "../licence";
import { FREE_PAGE_CAP as FREE_PAGE_CAP_SHARE, RAM_ATTACH_PREFIX, sharedName, sniffPicked, useDocumentContext, useDocuments } from "../documents";
import { deviceNoun } from "../lib/deviceNoun";
import { useAppServices } from "../services/AppServices";

type Row = AssistantRow;
type Status = { kind: "loading" } | { kind: "ready" } | { kind: "error"; error: string };

/* Headless device runs (USB, nothing can tap the screen): bundling with EXPO_PUBLIC_AUTOPROMPT=1 sends one prompt 2 s after the model loads and writes the numbers to Documents/dev-run.json; any other value is sent verbatim (emulators cannot type non-ASCII). Store builds never set it. */
const AUTOPROMPT_ENV = process.env.EXPO_PUBLIC_AUTOPROMPT ?? "";
const AUTOPROMPT = AUTOPROMPT_ENV === "1" ? "Explain in about 150 words why the sky is blue." : AUTOPROMPT_ENV.length > 1 && AUTOPROMPT_ENV !== "file" ? AUTOPROMPT_ENV : null;
/* EXPO_PUBLIC_AUTOPROMPT=file: a phone whose touch input adb cannot reach (OnePlus 6T) takes each prompt from Documents/dev-prompt.txt instead; the file is consumed once submitted. */
const AUTOPROMPT_FILE = AUTOPROMPT_ENV === "file" ? "dev-prompt.txt" : null;
const DEV_RESULTS = AUTOPROMPT !== null || AUTOPROMPT_FILE !== null || DEV_AUTOVOICE_DICTATE;
/** Product ceiling for finishing a reply after the app goes to the background (§10.3 #21). */
const BACKGROUND_GRACE_MS = 15_000;
const NOTICE_KEY = "notice.canBeWrong";
/** How long after a stream ends the list still follows late-measured cells (the ledger row). */
const SETTLE_MS = 1500;
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
  /** Value moments (§12.3): the mic, "remember this", the PRO tags. Carries why the tap was refused. */
  onOpenPaywall?: (reason?: PaywallReason) => void;
  /** Companions live in the vault (whisper, the vision projector). */
  onOpenVault?: () => void;
  /** S44 hands-free voice mode (Pro). */
  onOpenVoice?: (chatId: string | null, incognito: boolean) => void;
  /** §7.8 advice card "Switch": the vault's default changes and this chat remounts on the new model. */
  onSwitchModel?: (id: string) => void;
  /** The shell's seal state ("loading" while the first model pack is still arriving, §8.8). */
  sealState?: SealState;
  sealProgress?: number;
  /** Text or files another app shared in (§7.7): opens the quick-action sheet / attaches the files once the model is ready. */
  seed?: SharePayload;
  onSeedConsumed?: () => void;
}

export { afterSheetClose };

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const wire = (rows: readonly Row[]): Pick<ChatMessage, "id" | "role" | "content" | "images">[] => rows.filter((r) => !r.streaming && !r.error).map(({ id, role, content, images }) => ({ id, role, content, ...(images?.length ? { images } : {}) }));
const toMessage = ({ role, content, images }: Pick<ChatMessage, "role" | "content" | "images">): Message => ({ role, content, ...(images?.length ? { images: images.map(imageUri) } : {}) });

const NO_SNOOZE: readonly string[] = [];

export function Chat({ store, chatId, incognito, onOpenChats, onChatCreated, personaId, onNewChat, onOpenDocuments, onOpenPaywall, onOpenVault, onOpenVoice, onSwitchModel, sealState, sealProgress, seed, onSeedConsumed }: ChatProps) {
  const type = useType();
  const fontScale = useFontScale();
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const lift = useKeyboardLift();
  const ent = useEntitlements();
  /* §11.1 Guideline 1.2 / §11.2 AI-content: family-safe mode, on by default, switched in Settings → Chat. */
  const familySafe = useAppServices().prefs.contentSafety;
  const { tier, can } = useEntitlement();
  const licence = useLicence();
  const workPrice = (licence?.priceOf(PRODUCTS.work) ?? fallbackPrice(PRODUCTS.work)).display;
  const { engine, model } = getEngine();
  const inputRef = useRef<TextInput | null>(null);
  /* F27: the empty chat's TAB order was whatever Android's geometric focus search produced. It is declared here
     instead — chip → chip → composer. Focus can only leave the list at all because of plugins/withScrollFocusEscape. */
  const chipRefs = useRef<(View | null)[]>([]);
  const [chipNext, setChipNext] = useState<(number | undefined)[]>([]);
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const next = SUGGESTIONS.map((_, i) => findNodeHandle((i + 1 < SUGGESTIONS.length ? chipRefs.current[i + 1] : inputRef.current) ?? null) ?? undefined);
    setChipNext((prev) => (prev.length === next.length && prev.every((v, i) => v === next[i]) ? prev : next));
  });
  const focused = useRef(true);
  const session = useRef<Session | null>(null);
  const abort = useRef<AbortController | null>(null);
  const stopReason = useRef<StoppedBy | "loop" | null>(null);
  const noSpace = useRef(false);
  const chatRef = useRef<string | null>(chatId);
  const list = useRef<FlatList<Row>>(null);
  /* §8.9: on a wide window the sidebar is the chats door and the stream is a centred column; the phone shell is untouched. */
  const wide = useWide();
  const sidebar = useSidebarOpen();
  const nearBottom = useRef(true);
  const follow = useRef(true);
  const settleUntil = useRef(0);
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
  const [modelSheetOpen, setModelSheetOpen] = useState(false);
  const [safety, setSafety] = useState<CrisisResource[] | null>(null);
  const [notice, setNotice] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [attachOpen, setAttachOpen] = useState(false);
  /** A picture reached a model that cannot look at it (QA F36): the inline offer that switches to the one that can. */
  const [visionOffer, setVisionOffer] = useState<"switch" | "companion" | null>(null);
  /** How many attached documents this turn is waiting for before it answers (QA F125/F126); 0 means it is not waiting. */
  const [readingDocs, setReadingDocs] = useState(0);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [redactOpen, setRedactOpen] = useState(false);
  const [pasteOffer, setPasteOffer] = useState(false);
  const [micOpen, setMicOpen] = useState(false);
  const [preferWhisper, setPreferWhisper] = useState(false);
  const [pendingImages, setPendingImages] = useState<PickedImage[]>([]);
  const [readingId, setReadingId] = useState<string | null>(null);
  /** S43: the text under the quick-action sheet and where it came from ("processText" can hand a result back). */
  const [quick, setQuick] = useState<{ text: string; source: "message" | "share" | "processText"; replaceable: boolean } | null>(null);
  /* What dictation last produced; submit() compares it with the sent text so a dictated message counts as the "voice" use (§7.8). */
  const dictatedDraft = useRef<string | null>(null);
  const onDictated = useCallback((text: string) => {
    dictatedDraft.current = text;
  }, []);
  const [lastDictated, setLastDictated] = useState(false);
  const dictation = useDictation({ draft, setDraft, tier, locale: i18n.language, preferWhisper, onFinal: onDictated });
  /* Attachments key by chat id; a chat that does not exist yet, and every incognito chat, attach under a RAM-only key (§5.7). */
  const draftKey = useRef(`${RAM_ATTACH_PREFIX}draft-${Date.now().toString(36)}`).current;
  const [docKey, setDocKey] = useState<string>(chatId ? (incognito ? `${RAM_ATTACH_PREFIX}${chatId}` : chatId) : draftKey);
  const docs = useDocumentContext(docKey);
  const redaction = useRedaction(docKey);
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
        const line = describeLoad(engine.id, model.id, model.uri, loadMs.current);
        if (line) console.log(line);
        session.current = s;
        setStatus({ kind: "ready" });
      })
      .catch((e: unknown) => {
        const error = errorText(e);
        if (DEV_RESULTS) writeDevResult({ engine: engine.id, model: model.id, error });
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
  useShortcut("model-picker", () => focused.current && setModelSheetOpen(true));
  useShortcut("continue", () => {
    if (!focused.current || busy) return;
    const last = [...rowsRef.current].reverse().find((r) => r.role === "assistant");
    if (last?.stopped && !last.streaming) void continueRow(last);
  });
  useShortcut("new-chat", () => focused.current && onNewChat?.(false));
  useShortcut("toggle-incognito", () => focused.current && onNewChat?.(!incognito));
  useShortcut("focus-composer", () => focused.current && inputRef.current?.focus());

  const budget = useMemo(() => {
    const system = composeSystemPrompt({ baseline: safetyBaseline(SAFETY_BASELINE, familySafe), persona, chatPrompt: settings.systemPrompt });
    return buildPrompt({ system, summary: chat?.summary, summaryUpTo: chat?.summaryUpTo, messages: wire(rows), nCtx, scale: tokenScale, reserve: 0 });
  }, [rows, chat?.summary, chat?.summaryUpTo, persona, settings.systemPrompt, nCtx, tokenScale, familySafe]);
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
    moveRedaction(draftKey, key);
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
    /* Set while streaming so the abort below is read as a replacement, not as the user's Stop (which would offer "Continue"). */
    let familySafeHit = false;
    const started = Date.now();
    /* The row changes identity the moment the partial answer is written through, and `patch` must follow it there. */
    let rowId = targetId;
    let savedId = existingMessageId ?? null;
    const partial = new PartialAnswerSaver();
    const patch = (fn: (r: Row) => Row) => setRows((all) => all.map((x) => (x.id === rowId ? fn(x) : x)));
    const answerWithoutModel = async (key: string, values?: Record<string, unknown>, safety?: SafetyMark) => {
      const saved = await store.appendMessage({ chatId: chatIdNow, role: "assistant", content: t(key, values ?? {}), modelId: model.id, ...(safety ? { safety } : {}) });
      setRows((all) => all.map((x) => (x.id === rowId ? saved : x)));
    };
    /* §8.8 row 5a: the answer on screen is also on disk, marked as a system stop, so a jetsam kill leaves it there to Continue. */
    const writeThrough = async (): Promise<void> => {
      const content = prefix + reply;
      try {
        if (savedId) await store.updateMessage(chatIdNow, savedId, { content, stopped: true, stoppedBy: "system", ...(reasoning ? { reasoning } : {}) });
        else {
          const saved = await store.appendMessage({ chatId: chatIdNow, role: "assistant", content, modelId: model.id, stopped: true, stoppedBy: "system", ...(reasoning ? { reasoning } : {}) });
          savedId = saved.id;
          setRows((all) => all.map((x) => (x.id === rowId ? { ...x, id: saved.id } : x)));
          rowId = saved.id;
        }
        partial.saved(Date.now(), reply.length);
      } catch (e: unknown) {
        /* A disk that will not take the partial is the final write's news (QA R4-F13); the answer keeps streaming. */
        partial.stop();
        if (__DEV__) console.warn("[chat] partial answer not saved", e);
      }
    };
    try {
      /* Memory is Pro (§7.6): a lapsed licence stops the model seeing the facts, it does not delete them. */
      const facts = can("memory") ? await store.memoryFor(chatIdNow, persona.id) : [];
      const lastUserAt = history.map((m) => m.role).lastIndexOf("user");
      const lastUser = lastUserAt >= 0 ? history[lastUserAt]!.content : "";
      /* The first message moves the attachments off the draft key, so the gate reads the key this chat has now, not the one this render captured. */
      const attachKey = incognito ? `${RAM_ATTACH_PREFIX}${chatIdNow}` : chatIdNow;
      /* "Continue" resumes a partial answer with the passages it already saw, so the gate only decides fresh turns. */
      const planTurn = () => planDocsTurn({ strict: docs.strict, ...library.attachmentState(attachKey) });
      let turn: ReturnType<typeof planDocsTurn> = !existingMessageId && lastUser ? planTurn() : { kind: "model" };
      /* A file the user attached is read before it is answered about, never after (QA F125/F126). */
      if (turn.kind === "wait") {
        setReadingDocs(library.attachmentState(attachKey).reading);
        try {
          await library.whenAttachmentsRead(attachKey, ac.signal);
        } finally {
          setReadingDocs(0);
        }
        if (ac.signal.aborted) return;
        turn = planTurn();
      }
      /* Strict mode with nothing to search says so instead of answering from the model's weights (QA F34). */
      if (turn.kind === "refuse") {
        await answerWithoutModel(turn.messageKey);
        return;
      }
      /* F50: an explicitly prohibited request is refused before a token is generated, so the mode costs nothing when it fires. */
      if (!existingMessageId && screenText(lastUser, familySafe).flagged) {
        await answerWithoutModel("chat.familySafe.refused", undefined, "family-safe");
        return;
      }
      /* F38: how long this answer should be, as one line in the prompt and a cap for this turn. "Continue" asks for the rest, so it gets the ceiling. */
      const length = planAnswerLength({
        text: lastUser,
        use: detectUse({ text: lastUser, personaId: persona.id, personaIcon: persona.icon, hasDocuments: docs.documents.length > 0, dictated: lastDictated }),
        continuing: !!existingMessageId,
      });
      const system = composeSystemPrompt({ baseline: safetyBaseline(SAFETY_BASELINE, familySafe), persona, chatPrompt: settings.systemPrompt, memory: facts, languageHint: languageHint(lastUser), length: length.instruction });
      const prompt = buildPrompt({ system, summary: chat?.summary, summaryUpTo: chat?.summaryUpTo, messages: history.map((m, i) => ({ id: String(i), ...m })), nCtx, scale: tokenScale });
      let messages = prompt.messages;
      /* Attached documents (§7.3, §8.5): retrieve, fence, cite. */
      if (turn.kind === "retrieve") {
        try {
          const rag = await docs.buildPrompt(lastUser, history.slice(0, lastUserAt), nCtx, system);
          if (rag.prompt.noAnswer) {
            await answerWithoutModel("documents.notFound");
            return;
          }
          messages = rag.prompt.messages;
          citations = rag.prompt.citations;
        } catch (e: unknown) {
          /* A toast is not an answer: a search that failed must not leave the model answering as if nothing were attached. */
          flash(t(`documents.error.${errorText(e)}`, { defaultValue: errorText(e) }));
          await answerWithoutModel("documents.notRead");
          return;
        }
      }
      const opts = { reasoning: thinkingAvailable && settings.thinking, maxTokens: length.maxTokens, ...(persona.temperature !== undefined ? { temperature: persona.temperature } : {}) };
      /* Photos in the prompt (§7.1): the one projector we ship fits Instant's embedding width, so any other model
         would answer as if the picture were not there (QA F36). Never drop a picture without saying so. */
      if (messages.some((m) => m.images?.length)) {
        const mmproj = modelHasVision(model.id) ? resolveVision() : null;
        if (!mmproj || !(await enableVision(mmproj))) {
          const canSee = visionChatModel();
          if (lastUserAt >= 0 && history[lastUserAt]!.images?.length) {
            const offer = !modelHasVision(model.id) && canSee ? "switch" : "companion";
            await answerWithoutModel(offer === "switch" ? "chat.vision.needsOther" : "chat.vision.companionMissing", { seer: canSee ? modelLabel(canSee.id) : "" });
            setVisionOffer(offer);
            return;
          }
          /* Only older turns carry pictures; the model that could see them already answered for them. */
          messages = messages.map(({ images: _drop, ...rest }) => rest);
        }
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
          if (partial.due(Date.now(), reply.length)) await writeThrough();
          if (tokens % 8 === 0) {
            setLiveTps((tokens * 1000) / Math.max(1, Date.now() - firstAt));
            /* F50: catching it mid-stream is what keeps the text off the screen; the check below still catches what the last chunk added. */
            if (screenText(reply, familySafe).flagged) {
              familySafeHit = true;
              ac.abort();
            } else if (tokens >= 24 && detectLoop(reply)) {
              stopReason.current = "loop";
              ac.abort();
            }
          }
        }
        if (d.done) usage = d.done;
      }
      const reason = stopReason.current as StoppedBy | "loop" | null;
      /* F50: the answer the model actually produced is never stored or exported; the row keeps one sentence and the mark. */
      const familySafeReplaced = familySafeHit || screenText(reply, familySafe).flagged;
      if (familySafeReplaced) {
        reply = t("chat.familySafe.replaced");
        reasoning = "";
        reasoningMs = undefined;
        citations = undefined;
        patch((x) => ({ ...x, content: prefix + reply, reasoning: "" }));
      }
      /* The guard aborts through its own controller (background grace on Android, heat, memory): still a system stop with "Continue". */
      const guardStopped = wasStoppedByGuard();
      const stopped = !familySafeReplaced && (ac.signal.aborted || guardStopped);
      const stoppedBy: StoppedBy | undefined = stopped ? (reason === "system" || guardStopped ? "system" : "user") : undefined;
      const safety: SafetyMark | undefined = familySafeReplaced ? "family-safe" : undefined;
      if (usage && !citations) setTokenScale((prev) => calibrate(prompt.used, usage!.promptTokens, prev));
      if (citations && reply.trim().startsWith(NOT_FOUND_TOKEN)) {
        reply = t("documents.notFound");
        citations = undefined;
        patch((x) => ({ ...x, content: prefix + reply }));
      }
      let keptId: string | null = null;
      if (!reply && !reasoning && stopped && !savedId) {
        setRows((all) => all.filter((x) => x.id !== rowId));
      } else if (savedId) {
        keptId = savedId;
        /* stopped/stoppedBy are written unconditionally: the write-through marked the row a system stop, and this turn may have ended well. */
        await store.updateMessage(chatIdNow, savedId, {
          content: prefix + reply,
          stopped: !!stopped,
          stoppedBy: stoppedBy ?? null,
          ...(reasoning ? { reasoning } : {}),
          ...(reasoningMs !== undefined ? { reasoningMs } : {}),
          ...(usage ? { usage } : {}),
          ...(citations?.length ? { citations } : {}),
          ...(safety ? { safety } : {}),
        });
        patch((x) => ({ ...x, content: prefix + reply, streaming: false, stopped: !!stopped, stoppedBy, loop: !familySafeReplaced && reason === "loop", ...(usage ? { usage } : {}), ...(citations?.length ? { citations } : {}), ...(safety ? { safety } : {}) }));
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
          ...(safety ? { safety } : {}),
          ...(citations?.length ? { citations } : {}),
        });
        setRows((all) => all.map((x) => (x.id === rowId ? { ...saved, loop: !familySafeReplaced && reason === "loop" } : x)));
        rowId = saved.id;
        keptId = saved.id;
      }
      /* The "paused in the background" line belongs to the turn the grace cut, not to the app: without an owner it followed the user into every later chat (QA F28). */
      noteGenerationEnded({ chatId: chatIdNow, guardStopped, keptId });
    } catch (e: unknown) {
      /* A full disk is the strip's news, never an assistant row: the unsaved answer leaves with its pending row (QA R4-F13). */
      if (isNoSpaceError(e)) {
        reportStorageFull();
        noSpace.current = true;
        if (savedId) patch((x) => ({ ...x, streaming: false }));
        else setRows((all) => all.filter((x) => x.id !== rowId));
      } else {
        const error = errorText(e);
        patch((x) => ({ ...x, streaming: false, error }));
      }
    } finally {
      abort.current = null;
      setBusy(false);
      setLiveTps(0);
      /* The ledger row is measured after `busy` drops, so the follow window stays open a little longer (QA N1: the end sat under the composer). */
      settleUntil.current = Date.now() + SETTLE_MS;
      /* Not the animated scrollToEnd: its stale last-cell target overrode the pins and left the end a line under the composer with the keyboard up (QA N1). */
      if (follow.current || nearBottom.current) requestAnimationFrame(pinToEnd);
      const last = engine.stats();
      const result = { engine: engine.id, model: model.id, uri: model.uri, loadMs: loadMs.current, ...last, elapsedMs: Date.now() - started, info: "devInfo" in engine ? engine.devInfo : undefined };
      if (__DEV__) console.log("[stats]", JSON.stringify(result));
      if (DEV_RESULTS) writeDevResult({ ...result, reply });
    }
  };

  const submit = async (input: string) => {
    const text = input.trim() || (pendingImages.length ? t("chat.attach.photo") : "");
    if (!text || !session.current || busy) return;
    if (!chatRef.current && chatBlockedByStorage()) return;
    setDraft("");
    const dictated = isDictatedSend(dictatedDraft.current, text);
    setLastDictated(dictated);
    dictatedDraft.current = null;
    /* No screen names the voice use on its own: every model in the catalog is good at it, so the advice card never has a reason to. */
    if (DEV_RESULTS) writeDevResult({ send: { dictated, use: detectUse({ text, personaId: persona.id, personaIcon: persona.icon, hasDocuments: docs.documents.length > 0, dictated }) } });
    noSpace.current = false;
    let userId: string | null = null;
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
      const images = pendingImages.map((p) => storedImagePath(p.uri));
      setPendingImages([]);
      const user = await store.appendMessage({ chatId: chatIdNow, role: "user", content: text, ...(images.length ? { images } : {}) });
      userId = user.id;
      const pendingId = `pending-${Date.now()}`;
      setRows((all) => [...all, user, { id: pendingId, chatId: chatIdNow, role: "assistant", content: "", modelId: model.id, createdAt: Date.now(), streaming: true }]);
      nearBottom.current = true;
      follow.current = true;
      requestAnimationFrame(() => list.current?.scrollToEnd({ animated: true }));
      const history: Message[] = wire(rowsRef.current).map(toMessage);
      await generate(chatIdNow, history, pendingId, "");
      if (noSpace.current) throw new Error("no-space");
    } catch (e: unknown) {
      if (noSpace.current || isNoSpaceError(e)) {
        /* The turn comes back to the composer whole; a user row the store took without its answer goes (best effort on a disk this full). */
        reportStorageFull();
        if (userId) {
          const id = userId;
          setRows((all) => all.filter((x) => x.id !== id));
          if (chatRef.current) void store.deleteMessagesFrom(chatRef.current, id).catch(() => undefined);
        }
        setDraft(input);
        setBusy(false);
        return;
      }
      flash(errorText(e));
      /* A message the store could not take stays in the composer instead of vanishing with the toast (QA F15). */
      if (!rowsRef.current.some((r) => r.role === "user" && r.content === text)) setDraft(input);
      setBusy(false);
    }
  };
  const send = () => submit(draft);
  /* The dev voice hook runs once, when the model is ready; these keep it on the live send path instead of that render's. */
  const submitRef = useRef(submit);
  submitRef.current = submit;
  const dictationRef = useRef(dictation);
  dictationRef.current = dictation;

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
    if (nearBottom.current) follow.current = true;
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

  useEffect(() => {
    if (!AUTOPROMPT_FILE || status.kind !== "ready" || busy) return;
    const timer = setInterval(() => {
      const file = new File(Paths.document, AUTOPROMPT_FILE);
      if (!file.exists) return;
      const raw = file.textSync().trim();
      file.delete();
      if (raw === "/scroll") return list.current?.scrollToEnd({ animated: false });
      const lines = raw.split("\n");
      const images = lines.filter((l) => l.startsWith("image:")).map((l) => new File(Paths.document, l.slice("image:".length).trim()));
      if (images.length) return setPendingImages(images.map((f) => ({ uri: f.uri, width: 0, height: 0, bytes: f.size ?? 0 })));
      const text = lines.join("\n").trim();
      if (text) void submit(text);
    }, 1500);
    return () => clearInterval(timer);
  }, [status.kind, busy, pendingImages]);

  /* A shared item (§7.7): files join the library and this chat; text opens the quick-action sheet (S43). Consumed once, when the model is up. */
  const inFront = useIsFocused();
  useEffect(() => {
    if (!seed || status.kind !== "ready" || !inFront) return;
    onSeedConsumed?.();
    if (seed.kind === "files") {
      void (async () => {
        let attached = 0;
        let blocked: "document" | "office" | null = null;
        for (const f of seed.files) {
          /* The share sheet is a door into the library like any other: same tier gate, same format gate (QA F72). */
          const name = sharedName(f.uri, f.name, f.mimeType);
          const verdict = fileIntake(tier, sniffPicked(f.uri, name), docs.documents.length + attached);
          if (verdict.kind === "paywall") {
            blocked ??= verdict.moment;
            continue;
          }
          const doc = await library.importFile(f.uri, name, { pageCap: tier === "free" ? FREE_PAGE_CAP_SHARE : undefined, incognito });
          if (doc.status === "failed" || doc.status === "empty") flash(t("quick.fileFailed", { name }));
          else {
            docs.attach(doc.id);
            attached++;
          }
        }
        if (attached) flash(t("quick.filesAttached", { count: attached }));
        if (seed.text) setDraft(seed.text);
        if (blocked) {
          flash(t(blocked === "office" ? "quick.fileWork" : "quick.filePro"));
          const why = blocked;
          afterSheetClose(() => onOpenPaywall?.(why));
        }
      })();
      return;
    }
    /* Only once this screen is in front (the sheet another screen had open is gone): a second Modal presented meanwhile never shows on iOS. */
    afterSheetClose(() => setQuick({ text: seed.text, source: seed.kind === "processText" ? "processText" : "share", replaceable: seed.kind === "processText" && seed.replaceable }));
  }, [seed, status.kind, inFront]);

  /* The sheet streams through the same guarded engine as a chat turn; `busy` keeps the composer quiet meanwhile. */
  const runQuick = (messages: Message[], signal: AbortSignal, turn: { action: QuickActionId; text: string }): AsyncIterable<Delta> => {
    const s = session.current;
    const length = planAnswerLength({ text: turn.text, use: detectUse({ text: turn.text, quickAction: turn.action }) });
    const gen = engine.generate(s!, messages, { reasoning: false, maxTokens: length.maxTokens, temperature: 0.3 }, signal);
    setBusy(true);
    return {
      [Symbol.asyncIterator]: async function* () {
        try {
          for await (const d of gen) yield d;
        } finally {
          setBusy(false);
        }
      },
    };
  };
  const closeQuick = () => {
    const q = quick;
    setQuick(null);
    if (q?.source === "processText") finishProcessText(null);
  };
  const openQuickInChat = async (userTurn: string, result: string | null) => {
    const q = quick;
    setQuick(null);
    if (q?.source === "processText") finishProcessText(null);
    if (!result) return setDraft(userTurn);
    try {
      const chatIdNow = await ensureChat(userTurn);
      const user = await store.appendMessage({ chatId: chatIdNow, role: "user", content: userTurn });
      const answer = await store.appendMessage({ chatId: chatIdNow, role: "assistant", content: result, modelId: model.id });
      setRows((all) => [...all, user, answer]);
      requestAnimationFrame(() => list.current?.scrollToEnd({ animated: true }));
    } catch (e: unknown) {
      flash(errorText(e));
    }
  };
  const replaceFromQuick = (result: string) => {
    setQuick(null);
    if (finishProcessText(result)) flash(t("quick.replaced"));
  };

  const lastUserId = [...rows].reverse().find((r) => r.role === "user")?.id;
  const lastAssistant = [...rows].reverse().find((r) => r.role === "assistant");
  const lastUserText = [...rows].reverse().find((r) => r.role === "user")?.content ?? "";
  const wrongScript = (row: Row) => row.role === "assistant" && !!languageHint(lastUserText) && scriptOf(row.content) !== scriptOf(lastUserText);
  const languageCode = languageCodeOf(lastUserText);
  const languageName = languageCode ? t(`language.${languageCode}`, { defaultValue: LANGUAGE_NAME_BY_CODE[languageCode] ?? languageCode }) : "";
  /* §7.8 recommendation by use + language + device: the fit map decides, the vault knows what is installed and what fits. */
  const adviceLanguage = lastUserText ? detectLanguage(lastUserText) : null;
  const use = detectUse({ text: lastUserText, personaId: persona.id, personaIcon: persona.icon, hasDocuments: docs.documents.length > 0, dictated: lastDictated });
  /* The card offers Switch and Install, which only a phone or desktop vault can carry out; the browser tier holds the single model boot picked (screens/vault/VaultEntry.web.tsx). */
  const advice = useMemo(() => {
    if (Platform.OS === "web" || !lastUserText) return null;
    const vault = getVault();
    const installed = vault
      .entries()
      .filter((e) => e.model.role === "chat" && !e.stray && e.state.kind === "ready")
      .map((e) => e.model.id);
    return adviseModel({ current: vault.model(model.id), use, languageCode: adviceLanguage, device: vault.device, installed, catalog: vault.manifest.models });
  }, [lastUserText, model.id, use, adviceLanguage]);
  const shownAdvice = useRef<string | null>(null);
  const adviceChat = chatRef.current ?? draftKey;
  const adviceSnoozed = chat?.adviceSnoozed ?? NO_SNOOZE;
  shownAdvice.current = adviceToShow(adviceChat, advice?.key ?? null, shownAdvice.current, adviceSnoozed);
  const adviceShown = advice && shownAdvice.current === advice.key && lastAssistant && status.kind === "ready" ? advice : null;
  /* "Not now", Switch and Install all snooze the reason on the chat row, so it survives relaunch (§7.8). */
  const snoozeAdvice = (key: string) => {
    const id = chatRef.current;
    if (!id) return;
    const next = [...adviceSnoozed.filter((k) => k !== key), key];
    setChat((c) => (c ? { ...c, adviceSnoozed: next } : c));
    void store.updateChat(id, { adviceSnoozed: next });
  };
  const weakLanguage = useMemo(() => {
    if (!adviceLanguage) return null;
    const tier = languageTierOf(getVault().model(model.id) ?? {}, adviceLanguage);
    return tier === "none" || tier === "basic" ? adviceLanguage : null;
  }, [adviceLanguage, model.id]);
  /* §6.3 mediate honestly: a browser user cannot switch, so instead of the card they get the same verdict the vault's picker gives, with no action. */
  const noBetterHere = useMemo(() => (Platform.OS === "web" && lastUserText ? modelShortfall(getVault().model(model.id), use, adviceLanguage) : null), [lastUserText, model.id, use, adviceLanguage]);
  /* An empty chat has no language of its own yet; the sheet's recommendation then answers for the app's own language. */
  const uiLanguageCode = useMemo(() => {
    const base = i18n.language.split("-")[0]?.toLowerCase() ?? "en";
    return FIT_LANGUAGES.includes(base) ? base : "en";
  }, [i18n.language]);
  /* §7.8: the loaded model rates this language none/basic. The notice names what does better here and switches or downloads it. */
  const languageUpgrade = useMemo(() => {
    if (Platform.OS === "web" || !adviceLanguage) return null;
    const vault = getVault();
    const installed = vault
      .entries()
      .filter((e) => e.model.role === "chat" && !e.stray && e.state.kind === "ready")
      .map((e) => e.model.id);
    return betterForLanguage({ current: vault.model(model.id), use, languageCode: adviceLanguage, device: vault.device, installed, catalog: vault.manifest.models });
  }, [adviceLanguage, model.id, use]);
  const personaName = persona.builtIn ? t(`persona.${persona.id.replace("builtin:", "")}`) : persona.name;

  const statusLine = status.kind === "loading" ? t("chat.loading", { model: modelLabel(model.id) }) : status.kind === "error" ? t("chat.loadFailed", { model: modelLabel(model.id), error: status.error }) : null;
  const sealOverride = sealState && sealState !== "sealed" && sealState !== "generating" ? sealState : undefined;
  const sealLabel = sealOverride === "loading" ? t("chat.delivering") : t("chat.sealed");
  const attachedNames = docs.documents.map((d) => d.name);
  const strictLocked = paywallFor(tier, { kind: "feature", feature: "strictDocuments" });
  /* Ticking a second document in the sheet is the same door as importing one (QA F146): it went through no gate at all. */
  const attachLocked = paywallFor(tier, { kind: "document", existing: docs.documents.length });
  const importFile = () => {
    setAttachOpen(false);
    afterSheetClose(() => {
      void pickIntoLibrary(library, tier, docs.documents.length, incognito).then((r) => {
        if (r.kind === "paywall") {
          flash(t(r.moment === "office" ? "quick.fileWork" : "quick.filePro"));
          onOpenPaywall?.(r.moment);
        }
        else if (r.kind === "error") flash(t(`documents.error.${r.error}`, { defaultValue: r.error }));
        else if (r.kind === "imported") docs.attach(r.id);
      }, (e: unknown) => flash(errorText(e)));
    });
  };
  /* The count is the sheet's to render; the tap also has to answer for the Work formats already in the library (QA F129). */
  const attachFromLibrary = (id: string) => {
    const verdict = planLibraryAttach(tier, libraryState.documents, id, docs.documents.length);
    if (verdict.kind === "ok") return docs.attach(id);
    setAttachOpen(false);
    flash(t(verdict.moment === "office" ? "quick.fileWork" : "quick.filePro"));
    afterSheetClose(() => onOpenPaywall?.(verdict.moment));
  };
  const onMic = () => {
    if (readingId) void stopSpeaking().then(() => setReadingId(null));
    dictation.toggle();
  };
  const openVoice = () => {
    setMicOpen(false);
    if (paywallFor(tier, { kind: "feature", feature: "voiceConversation" })) return afterSheetClose(() => onOpenPaywall?.("voiceConversation"));
    afterSheetClose(() => onOpenVoice?.(chatRef.current, incognito));
  };
  const useWhisper = () => {
    setMicOpen(false);
    if (paywallFor(tier, { kind: "feature", feature: "whisperDictation" })) return afterSheetClose(() => onOpenPaywall?.("whisperDictation"));
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
    const started = Date.now();
    afterSheetClose(() =>
      void speak(markdownToText(row.content), { uiLocale: i18n.language, onStart: () => devVoiceRecord("readAloud", { ttsStartMs: Date.now() - started, chars: row.content.length }), onDone: () => setReadingId((r) => (r === row.id ? null : r)), onError: () => setReadingId(null) }).then((outcome) => {
        if (outcome !== "no-voice") return;
        setReadingId(null);
        flash(t("chat.readAloud.none"));
      }),
    );
  };
  const visionReady = visionInstalled();
  const modelSees = modelHasVision(model.id);
  /* Instant is the only card the shipped projector fits; the sheet and the offer both name it (QA F36). */
  const seer = useMemo(() => (modelSees ? null : visionChatModel()), [modelSees]);
  const seerLabel = seer ? modelLabel(seer.id) : "";
  const seerReady = seer ? getVault().state(seer.id).kind === "ready" : false;
  const useSeer = () => {
    setAttachOpen(false);
    setVisionOffer(null);
    afterSheetClose(() => (seer && seerReady ? onSwitchModel?.(seer.id) : onOpenVault?.()));
  };
  const imageLimit = limits(tier).imagesPerMessage;
  const addPhoto = (source: "library" | "camera") => {
    setAttachOpen(false);
    const room = imageLimit - pendingImages.length;
    if (room <= 0) {
      if (tier !== "free") return;
      flash(t("chat.attach.photoLimit"));
      return afterSheetClose(() => onOpenPaywall?.("photos"));
    }
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
          const uri = new File(Paths.document, name).uri;
          /* Through the composer, not past it: this is the only way the "voice" use can be reached without a speech service. */
          if (DEV_AUTOVOICE_DICTATE) {
            const spoken = await dictationRef.current?.dictateFile(uri);
            results.push({ file: name, text: spoken, dictated: true });
            if (!alive) return;
            if (spoken) await submitRef.current?.(spoken);
          } else {
            const r = await getWhisper().transcribeFile(uri);
            results.push({ file: name, ...r });
          }
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
  const listHeight = useRef(0);
  /* Android clamps a far offset to the real end, while scrollToEnd's last-cell frame lags a streaming cell by one layout and landed a line short with the keyboard up (QA N1); larger offsets overflow the native int. Twice, so the clamp sees the frame that just grew. */
  const pinToEnd = () => {
    const once = () => (Platform.OS === "android" ? list.current?.scrollToOffset({ offset: 1e6, animated: false }) : list.current?.scrollToEnd({ animated: false }));
    once();
    requestAnimationFrame(once);
  };
  const following = () => follow.current || nearBottom.current;
  /* The keyboard lift shrinks the list but keeps its top offset, so the last answer would slide under the composer (QA N1). */
  const onListLayout = (e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    const shrank = h < listHeight.current;
    listHeight.current = h;
    if (shrank && following()) pinToEnd();
  };
  useEffect(() => {
    if (Platform.OS === "web") return;
    const sub = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow", () => {
      settleUntil.current = Date.now() + SETTLE_MS;
      if (following()) pinToEnd();
    });
    return () => sub.remove();
  }, []);
  const top = (
    <>
      <FloatingToolbar style={styles.header}>
        {/* The sidebar is the chats door on a wide window; with it hidden the header takes the job back. */}
        {wide && sidebar ? (
          <View style={styles.headerBtn} />
        ) : (
          <Pressable testID="open-chats" accessibilityRole="button" onPress={wide ? () => setSidebarOpen(true) : onOpenChats} hitSlop={8} style={styles.headerBtn}>
            <Text style={[type.body, { color: theme.text2 }]}>{t("chats.title")}</Text>
          </Pressable>
        )}
        <View style={styles.sealWrap}>
          <Seal size={28} color={theme.sealed} glow={theme.accent} state={sealOverride} progress={sealProgress} generating={busy || summarizing} label={sealLabel} />
          {compactChrome(fontScale * type.scale) ? null : (
            <Text testID="seal-label" numberOfLines={1} style={[type.monoLabel, styles.sealLabel, { color: theme.sealed }]}>
              {busy && liveTps > 0 ? t("chat.liveTps", { tps: liveTps.toFixed(0) }) : sealLabel}
            </Text>
          )}
        </View>
        <Pressable testID="model-chip" accessibilityRole="button" accessibilityLabel={t("modelSheet.title")} onPress={() => setModelSheetOpen(true)} style={[shape.chip, styles.modelChip, { backgroundColor: theme.surface2, borderColor: theme.border }]}>
          {incognito ? <Icon name="incognito" size={14} color={theme.text2} /> : <ChipGlyph size={12} color={theme.text2} />}
          <Text numberOfLines={1} style={[type.monoLabel, styles.modelChipText, { color: theme.text2 }]}>
            {modelLabel(model.id)}
          </Text>
        </Pressable>
      </FloatingToolbar>
      <BannerSpacer />
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
      {weakLanguage && status.kind === "ready" && !adviceShown?.language && !noBetterHere ? (
        <View testID="model-weak" style={[styles.notice, { borderColor: theme.border }]}>
          <Text testID="model-weak-line" style={[type.caption, styles.grow, { color: theme.text3 }]}>
            {languageUpgrade
              ? t("chat.modelWeakBetter", {
                  model: modelLabel(model.id),
                  language: t(`language.${weakLanguage}`, { defaultValue: LANGUAGE_NAME_BY_CODE[weakLanguage] ?? weakLanguage }),
                  better: modelLabel(languageUpgrade.better.model.id),
                })
              : t("chat.modelWeak", { model: modelLabel(model.id), language: t(`language.${weakLanguage}`, { defaultValue: LANGUAGE_NAME_BY_CODE[weakLanguage] ?? weakLanguage }) })}
          </Text>
          {languageUpgrade ? (
            <Pressable
              testID="model-weak-action"
              accessibilityRole="button"
              hitSlop={8}
              style={styles.noticeBtn}
              onPress={() => (languageUpgrade.better.reason.installed ? onSwitchModel?.(languageUpgrade.better.model.id) : setModelSheetOpen(true))}
            >
              <Text style={[type.caption, { color: theme.accent }]}>
                {languageUpgrade.better.reason.installed
                  ? t("chat.modelAdvice.switch", { model: modelLabel(languageUpgrade.better.model.id) })
                  : t("chat.modelAdvice.install", { model: modelLabel(languageUpgrade.better.model.id), size: formatModelBytes(languageUpgrade.better.model.bytes) })}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {noBetterHere && status.kind === "ready" ? (
        <Text testID="model-none-line" style={[type.monoLabel, styles.centered, { color: theme.text2 }]}>
          {t("models.recommendedNone", {
            device: deviceNoun(),
            model: modelLabel(model.id),
            use: t(`use.${noBetterHere.use}`).toUpperCase(),
            language: t(`language.${noBetterHere.languageCode}`, { defaultValue: LANGUAGE_NAME_BY_CODE[noBetterHere.languageCode] ?? noBetterHere.languageCode }).toUpperCase(),
          })}
        </Text>
      ) : null}
      {persona.disclaimer || settings.personaId !== DEFAULT_PERSONA_ID ? (
        <Text testID="persona-line" style={[type.caption, styles.centered, { color: theme.text3 }]}>
          {personaName}
          {persona.disclaimer ? ` · ${persona.disclaimer}` : ""}
        </Text>
      ) : null}
      {adviceShown ? (
        <ModelAdviceCard
          advice={adviceShown}
          theme={theme}
          locked={!!paywallFor(tier, { kind: "model", proOnly: !!adviceShown.better.model.proOnly })}
          onSwitch={(id) => {
            snoozeAdvice(adviceShown.key);
            onSwitchModel?.(id);
          }}
          onInstall={() => {
            snoozeAdvice(adviceShown.key);
            onOpenVault?.();
          }}
          onNotNow={() => snoozeAdvice(adviceShown.key)}
        />
      ) : null}
      {readingDocs ? (
        <View testID="reading-docs" style={[styles.notice, { borderColor: theme.border }]}>
          <Text style={[type.caption, styles.grow, { color: theme.text2 }]}>{t("documents.reading", { count: readingDocs })}</Text>
        </View>
      ) : null}
      {visionOffer ? (
        <View testID="vision-offer" style={[styles.notice, { borderColor: theme.border }]}>
          <Text style={[type.caption, styles.grow, { color: theme.text2 }]}>{t(visionOffer === "switch" ? "chat.vision.offer" : "chat.vision.offerCompanion", { model: modelLabel(model.id), seer: seerLabel })}</Text>
          <Pressable testID="vision-offer-action" accessibilityRole="button" onPress={useSeer} hitSlop={8} style={styles.noticeBtn}>
            <Text style={[type.caption, { color: theme.accent }]}>{seerReady ? t("chat.modelAdvice.switch", { model: seerLabel }) : t("voice.openVault")}</Text>
          </Pressable>
        </View>
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
      {attachedNames.length || docs.strict ? (
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
      <RedactBar hasDraft={!!draft.trim()} pasteOffer={pasteOffer} active={redaction.active} reveal={redaction.reveal} onOpen={() => setRedactOpen(true)} onToggleReveal={() => redaction.setReveal(!redaction.reveal)} />
      <ContextMeter fullness={budget.fullness} />
      <Composer
        inputRef={inputRef}
        onAttach={() => setAttachOpen(true)}
        attachedCount={attachedNames.length}
        onMic={onMic}
        onMicLongPress={() => setMicOpen(true)}
        mic={micPhase}
        value={draft}
        onChange={(text) => {
          /* A paste longer than PASTE_OFFER_CHARS (§7.3 Work) turns the Redact chip amber; typing never does. */
          if (text.length - draft.length > PASTE_OFFER_CHARS) setPasteOffer(true);
          else if (!text.trim()) setPasteOffer(false);
          setDraft(text);
        }}
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

  const bottomBlock = wide ? <View style={styles.column}>{bottom}</View> : bottom;

  return (
    <View style={[styles.root, { backgroundColor: incognito ? theme.well : theme.bg, paddingTop: liquidGlass ? 0 : insets.top + 8, paddingBottom: lift || insets.bottom }]}>
      {/* Glass only reads as glass with content moving under it (§9.7): on iOS 26 both bars float over the list, which pads itself by their measured heights. */}
      {liquidGlass ? null : top}
      <FlatList
        ref={list}
        {...listClipping}
        data={rows}
        keyExtractor={(r) => r.id}
        contentContainerStyle={[styles.list, wide ? styles.column : null, liquidGlass ? { paddingTop: topH + 8, paddingBottom: bottomH + 8 } : null]}
        onScroll={onScroll}
        onLayout={onListLayout}
        scrollEventThrottle={64}
        keyboardShouldPersistTaps="handled"
        accessibilityActions={[{ name: "readLatest", label: t("chat.a11y.readLatest") }]}
        onAccessibilityAction={(e) => {
          if (e.nativeEvent.actionName === "readLatest" && lastAssistant?.content) AccessibilityInfo.announceForAccessibility(lastAssistant.content);
        }}
        /* iOS only, for the floating-bar inset; pinning index 0 while the list is empty would cancel it (QA B10), and on Android the pin holds the view in place while an answer streams. */
        maintainVisibleContentPosition={rows.length && Platform.OS === "ios" ? { minIndexForVisible: 0 } : undefined}
        /* The user's own drag decides whether the answer is followed (§9.6, 100 px): the animated send scroll lands short while the new cells are unmeasured, so `nearBottom` alone goes stale. */
        onScrollBeginDrag={() => {
          follow.current = false;
        }}
        onContentSizeChange={() => {
          if ((busy || Date.now() < settleUntil.current) && following()) pinToEnd();
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
              {SUGGESTIONS.map((s, i) => (
                <Pressable
                  key={s}
                  ref={(v) => {
                    chipRefs.current[i] = v;
                  }}
                  nextFocusForward={chipNext[i]}
                  testID={`suggestion-${s}`}
                  accessibilityRole="button"
                  onPress={() => setDraft(t(`chat.suggest.${s}.prompt`))}
                  style={[shape.chip, styles.suggestion, { backgroundColor: theme.surface2, borderColor: theme.border }]}
                >
                  <Text style={[type.bodySmall, { color: theme.text2 }]}>{t(`chat.suggest.${s}`)}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        }
        renderItem={({ item }) =>
          item.role === "user" ? (
            <UserMessage message={redaction.display(item)} onLongPress={() => setActionRow(item)} />
          ) : (
            <AssistantMessage row={redaction.display(item)} nCtx={nCtx} quant={quant} onLongPress={() => setActionRow(item)} onContinue={item.id === lastAssistant?.id ? () => void continueRow(item) : undefined} onRegenerate={item.id === lastAssistant?.id ? () => void regenerate(item) : undefined} onUnlock={() => onOpenPaywall?.("detailedStats")} />
          )
        }
      />
      {liquidGlass ? null : bottomBlock}
      {liquidGlass ? (
        <ChromeBar style={[styles.overlayTop, { paddingTop: insets.top + 8 }]} onLayout={(e) => setTopH(e.nativeEvent.layout.height)}>
          {top}
        </ChromeBar>
      ) : null}
      {liquidGlass ? (
        <ChromeBar style={[styles.overlayBottom, { bottom: lift }]} onLayout={(e) => setBottomH(e.nativeEvent.layout.height)}>
          {bottomBlock}
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
            <SheetItem
              testID="action-quick"
              label={t("quick.menu")}
              hint={t("quick.menuHint")}
              disabled={busy || status.kind !== "ready"}
              onPress={() => {
                const row = actionRow;
                setActionRow(null);
                afterSheetClose(() => setQuick({ text: row.role === "assistant" ? markdownToText(row.content) : row.content, source: "message", replaceable: false }));
              }}
            />
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
                  afterSheetClose(() => onOpenPaywall?.("memory"));
                }} />}
                onPress={() => {
                  const id = chatRef.current;
                  const row = actionRow;
                  setActionRow(null);
                  if (!ent.pro) {
                    afterSheetClose(() => onOpenPaywall?.("memory"));
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
      <QuickActionsSheet
        visible={quick !== null}
        onClose={closeQuick}
        text={quick?.text ?? ""}
        replaceable={!!quick?.replaceable}
        run={runQuick}
        busy={busy && quick === null}
        onReplace={replaceFromQuick}
        onOpenInChat={(turn, result) => void openQuickInChat(turn, result)}
        uiLocale={i18n.language}
        onToast={flash}
      />
      <AttachSheet
        visible={attachOpen}
        onClose={() => setAttachOpen(false)}
        documents={libraryState.documents}
        attachedIds={docs.context.docIds}
        strict={docs.strict}
        onSetStrict={docs.setStrict}
        strictLocked={strictLocked}
        attachLocked={attachLocked}
        onUnlock={(why) => {
          setAttachOpen(false);
          afterSheetClose(() => onOpenPaywall?.(why));
        }}
        onAttach={attachFromLibrary}
        onImport={importFile}
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
        photoNote={!modelSees ? (seer ? t("chat.attach.noVision", { model: modelLabel(model.id), seer: seerLabel }) : t("chat.attach.noVisionHere", { model: modelLabel(model.id) })) : !visionReady ? t("chat.attach.visionMissing", { size: "205 MB" }) : tier === "free" ? t("chat.attach.photoFree") : undefined}
        {...(seer ? { onUseVisionModel: useSeer, visionModel: seerLabel } : {})}
      />
      <TemplatesSheet visible={templatesOpen} onClose={() => setTemplatesOpen(false)} onInsert={(text) => setDraft((d) => (d.trim() ? `${d}\n\n${text}` : text))} />
      <RedactSheet
        visible={redactOpen}
        onClose={() => setRedactOpen(false)}
        text={draft}
        chatKey={docKey}
        locked={!can("redaction")}
        price={workPrice}
        onUnlock={() => {
          setRedactOpen(false);
          afterSheetClose(() => onOpenPaywall?.("redaction"));
        }}
        onApply={(text) => {
          setDraft(text);
          setPasteOffer(false);
        }}
      />
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
              trailing={dictation.problem.whisperIsPro ? <ProTag onPress={() => { dictation.clearProblem(); afterSheetClose(() => onOpenPaywall?.("whisperDictation")); }} /> : undefined}
              onPress={() => {
                const pro = dictation.problem?.kind === "offline-missing" && dictation.problem.whisperIsPro;
                dictation.clearProblem();
                if (pro) return afterSheetClose(() => onOpenPaywall?.("whisperDictation"));
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
      <ChatModelSheet
        visible={modelSheetOpen}
        onClose={() => setModelSheetOpen(false)}
        theme={theme}
        currentId={model.id}
        use={use}
        languageCode={adviceLanguage ?? uiLanguageCode}
        tier={tier}
        onSwitchModel={onSwitchModel}
        onOpenVault={onOpenVault}
        onOpenPaywall={onOpenPaywall}
        onChatSettings={() => setSettingsOpen(true)}
      />
      <ChatSettingsSheet visible={settingsOpen} onClose={() => setSettingsOpen(false)} value={settings} onSave={(next) => void saveSettings(next)} customPersonas={customPersonas} modelId={model.id} thinkingAvailable={thinkingAvailable} />
    </View>
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
  /* §8.9 text measure: the stream and the composer keep 680 px however wide the window is. */
  column: { width: "100%", maxWidth: COLUMN_WIDTH, alignSelf: "center" },
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
