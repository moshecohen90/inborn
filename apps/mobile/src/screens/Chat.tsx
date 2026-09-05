import { useEffect, useRef, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View, useColorScheme } from "react-native";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { dark, light, fonts, radius } from "@inborn/ui";
import { titleFromFirstMessage, type ChatMessage, type ChatStore, type Message, type Session, type Stats, type Usage } from "@inborn/core";
import { getEngine, loadSession } from "../engine";
import { Seal } from "../components/Seal";

type Row = ChatMessage & { streaming?: boolean };
type Status = { kind: "loading" } | { kind: "ready" } | { kind: "error"; error: string };

export interface ChatProps {
  store: ChatStore;
  /** Null until the first message creates the chat. */
  chatId: string | null;
  incognito: boolean;
  onOpenChats: () => void;
  onChatCreated: (chatId: string) => void;
}

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function Chat({ store, chatId, incognito, onOpenChats, onChatCreated }: ChatProps) {
  const { t } = useTranslation();
  const theme = useColorScheme() === "light" ? light : dark;
  const insets = useSafeAreaInsets();
  const { engine, model } = getEngine();
  const session = useRef<Session | null>(null);
  const abort = useRef<AbortController | null>(null);
  const chatRef = useRef<string | null>(chatId);
  const list = useRef<FlatList<Row>>(null);
  const [status, setStatus] = useState<Status>({ kind: "loading" });
  const [stats, setStats] = useState<Stats | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const modelName = model.id.toUpperCase();

  useEffect(() => {
    let alive = true;
    loadSession()
      .then((s) => {
        if (!alive) return;
        session.current = s;
        setStatus({ kind: "ready" });
      })
      .catch((e: unknown) => {
        if (alive) setStatus({ kind: "error", error: errorText(e) });
      });
    return () => {
      alive = false;
      abort.current?.abort();
    };
  }, []);

  // Loads once per mount; App remounts this screen (key) when another chat is opened.
  useEffect(() => {
    const id = chatRef.current;
    if (!id) return;
    let alive = true;
    store
      .listMessages(id)
      .then((m) => {
        if (alive) setRows(m);
      })
      .catch((e: unknown) => console.warn("listMessages", e));
    return () => {
      alive = false;
    };
  }, [store]);

  const send = async () => {
    const text = draft.trim();
    const s = session.current;
    if (!text || !s || busy) return;
    setDraft("");
    setBusy(true);
    const ac = new AbortController();
    abort.current = ac;
    const pendingId = `pending-${Date.now()}`;
    let reply = "";
    let usage: Usage | undefined;
    try {
      let id = chatRef.current;
      if (!id) {
        const chat = await store.createChat({ modelId: model.id, incognito, title: titleFromFirstMessage(text) });
        id = chat.id;
        chatRef.current = id;
        onChatCreated(id);
      }
      const chatIdNow = id;
      const history: Message[] = [...rows.map(({ role, content }) => ({ role, content })), { role: "user", content: text }];
      const user = await store.appendMessage({ chatId: chatIdNow, role: "user", content: text });
      setRows((r) => [...r, user, { id: pendingId, chatId: chatIdNow, role: "assistant", content: "", modelId: model.id, createdAt: Date.now(), streaming: true }]);
      for await (const d of engine.generate(s, history, { reasoning: false }, ac.signal)) {
        if (d.text) {
          reply += d.text;
          const snapshot = reply;
          setRows((r) => r.map((x) => (x.id === pendingId ? { ...x, content: snapshot } : x)));
        }
        if (d.done) usage = d.done;
      }
      const stopped = ac.signal.aborted;
      if (!reply && stopped) {
        setRows((r) => r.filter((x) => x.id !== pendingId));
      } else {
        const saved = await store.appendMessage({ chatId: chatIdNow, role: "assistant", content: reply, modelId: model.id, stopped, usage });
        setRows((r) => r.map((x) => (x.id === pendingId ? saved : x)));
      }
    } catch (e: unknown) {
      const error = errorText(e);
      setRows((r) => r.map((x) => (x.id === pendingId ? { ...x, content: x.content || error, streaming: false } : x)));
    } finally {
      abort.current = null;
      setBusy(false);
      setStats(engine.stats());
    }
  };

  const statusLine =
    status.kind === "loading"
      ? t("chat.loading", { model: model.id })
      : status.kind === "error"
        ? t("chat.loadFailed", { model: model.id, error: status.error })
        : stats && stats.tokPerSec > 0
          ? t("chat.stats", { engine: engine.id, tps: stats.tokPerSec.toFixed(1), ttft: Math.round(stats.ttftMs) })
          : engine.id;

  return (
    <View style={[styles.root, { backgroundColor: incognito ? theme.well : theme.bg, paddingTop: insets.top + 8, paddingBottom: insets.bottom }]}>
      <View style={styles.header}>
        <Pressable testID="open-chats" accessibilityRole="button" onPress={onOpenChats} hitSlop={8} style={styles.headerBtn}>
          <Text style={[styles.headerBtnText, { color: theme.text2 }]}>{t("chats.title")}</Text>
        </Pressable>
        <View style={styles.sealWrap}>
          <Seal size={28} color={theme.sealed} glow={theme.accent} generating={busy} label={t("chat.sealed")} />
          <Text style={[styles.monoLabel, { color: theme.sealed }]}>{t("chat.sealed")}</Text>
        </View>
        <View style={[styles.chip, { backgroundColor: theme.surface2, borderColor: theme.border }]}>
          <Text style={[styles.monoLabel, { color: theme.text2 }]}>
            {incognito ? "◐" : "▣"} {modelName}
          </Text>
        </View>
      </View>
      {incognito ? (
        <Text testID="incognito-badge" style={[styles.monoLabel, styles.centered, { color: theme.text2 }]}>
          {t("chat.incognito.badge")}
        </Text>
      ) : null}
      <Text testID="status-line" style={[styles.mono, styles.centered, { color: status.kind === "error" ? theme.danger : theme.text3 }]}>
        {statusLine}
      </Text>
      <FlatList
        ref={list}
        data={rows}
        keyExtractor={(r) => r.id}
        contentContainerStyle={styles.list}
        onContentSizeChange={() => {
          if (busy) list.current?.scrollToEnd({ animated: false });
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Seal size={72} color={theme.sealed} glow={theme.accent} generating={false} label={t("chat.sealed")} />
            <Text style={[styles.monoLabel, { color: theme.text3 }]}>{modelName}</Text>
            <Text testID="empty-headline" style={[styles.headline, { color: theme.text }]}>
              {incognito ? t("chat.incognito.headline") : t("onboarding.headline")}
            </Text>
          </View>
        }
        renderItem={({ item }) =>
          item.role === "user" ? (
            <View testID="user-message" style={[styles.user, { backgroundColor: theme.surface1 }]}>
              <Text style={[styles.body, { color: theme.text }]}>{item.content}</Text>
            </View>
          ) : (
            <View testID="assistant-message" style={styles.assistant}>
              <Text style={[styles.monoLabel, { color: theme.text3 }]}>{t("chat.modelLabel", { model: (item.modelId ?? model.id).toUpperCase() })}</Text>
              <Text style={[styles.body, { color: theme.text }]}>
                {item.content}
                {item.streaming ? <Text style={{ color: theme.text2 }}>▍</Text> : null}
              </Text>
              {item.stopped ? <Text style={[styles.mono, { color: theme.text3 }]}>{t("chat.stopped")}</Text> : null}
            </View>
          )
        }
      />
      <View style={[styles.composer, { backgroundColor: incognito ? theme.bg : theme.well, borderColor: theme.border }]}>
        <TextInput
          testID="composer-input"
          value={draft}
          onChangeText={setDraft}
          placeholder={t("chat.placeholder")}
          placeholderTextColor={theme.text3}
          style={[styles.input, { color: theme.text }]}
          onSubmitEditing={send}
        />
        {busy ? (
          <Pressable testID="stop" accessibilityRole="button" onPress={() => abort.current?.abort()} style={[styles.btn, { backgroundColor: theme.danger }]}>
            <Text style={styles.stopText}>{t("chat.stop")}</Text>
          </Pressable>
        ) : (
          <Pressable testID="send" accessibilityRole="button" onPress={send} style={[styles.btn, { backgroundColor: theme.ctaFill }]}>
            <Text style={[styles.sendGlyph, { color: theme.ctaText }]}>↑</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, height: 44 },
  headerBtn: { minWidth: 44, height: 44, justifyContent: "center" },
  headerBtnText: { fontFamily: fonts.sans, fontSize: 16 },
  sealWrap: { flexDirection: "row", alignItems: "center", gap: 8 },
  chip: { height: 28, paddingHorizontal: 10, borderRadius: radius.chip, borderWidth: 1, justifyContent: "center" },
  mono: { fontFamily: fonts.mono, fontSize: 12, letterSpacing: 0.5 },
  monoLabel: { fontFamily: fonts.mono, fontSize: 11, fontWeight: "500", letterSpacing: 0.9, textTransform: "uppercase" },
  centered: { textAlign: "center", paddingTop: 4 },
  list: { padding: 16, gap: 14, flexGrow: 1, justifyContent: "flex-end" },
  empty: { alignItems: "center", gap: 12, marginBottom: 32 },
  headline: { fontFamily: fonts.sans, fontSize: 24, fontWeight: "600", textAlign: "center", letterSpacing: -0.3 },
  body: { fontFamily: fonts.sans, fontSize: 16, lineHeight: 25 },
  user: { alignSelf: "flex-end", maxWidth: "85%", padding: 12, borderRadius: radius.card, borderBottomEndRadius: 4 },
  assistant: { gap: 4 },
  composer: { flexDirection: "row", alignItems: "center", margin: 12, borderWidth: 1, borderRadius: radius.card, paddingLeft: 12 },
  input: { flex: 1, fontFamily: fonts.sans, fontSize: 16, minHeight: 44, paddingVertical: 10 },
  btn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", margin: 4 },
  stopText: { color: "#fff", fontSize: 12 },
  sendGlyph: { fontSize: 18 },
});
