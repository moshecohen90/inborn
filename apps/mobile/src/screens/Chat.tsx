import { useEffect, useRef, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View, useColorScheme } from "react-native";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { dark, light, fonts } from "@inborn/ui";
import type { Message, Session, Stats } from "@inborn/core";
import { createEngine } from "../adapters";

type Row = Message & { id: string; streaming?: boolean };
type Status = { kind: "loading" } | { kind: "ready" } | { kind: "error"; error: string };

export function Chat() {
  const { t } = useTranslation();
  const theme = useColorScheme() === "light" ? light : dark;
  const insets = useSafeAreaInsets();
  /* Lazy initializer: useRef(createEngine()) would build an engine (and ask Play for the pack) on every render. */
  const [boot] = useState(createEngine);
  const session = useRef<Session | null>(null);
  const abort = useRef<AbortController | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "loading" });
  const [stats, setStats] = useState<Stats | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [draft, setDraft] = useState("");
  const { engine, model } = boot;

  useEffect(() => {
    const started = Date.now();
    engine
      .load(model, { nCtx: 4096 })
      .then((s) => {
        console.log(`[inborn] ${engine.id} loaded ${model.uri} in ${Date.now() - started} ms`);
        session.current = s;
        setStatus({ kind: "ready" });
      })
      .catch((e: unknown) => setStatus({ kind: "error", error: e instanceof Error ? e.message : String(e) }));
    return () => void engine.unload();
  }, [engine, model]);

  const send = async () => {
    const text = draft.trim();
    const s = session.current;
    if (!text || !s || abort.current) return;
    setDraft("");
    const id = String(Date.now());
    const history: Message[] = [...rows.map(({ role, content }) => ({ role, content })), { role: "user", content: text }];
    setRows((r) => [...r, { id: id + "u", role: "user", content: text }, { id, role: "assistant", content: "", streaming: true }]);
    abort.current = new AbortController();
    try {
      for await (const d of engine.generate(s, history, { reasoning: false }, abort.current.signal)) {
        if (d.text) setRows((r) => r.map((x) => (x.id === id ? { ...x, content: x.content + d.text } : x)));
      }
    } catch (e: unknown) {
      const error = e instanceof Error ? e.message : String(e);
      setRows((r) => r.map((x) => (x.id === id ? { ...x, content: x.content || error } : x)));
    } finally {
      abort.current = null;
      setStats(engine.stats());
      setRows((r) => r.map((x) => (x.id === id ? { ...x, streaming: false } : x)));
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
    <View style={[styles.root, { backgroundColor: theme.bg, paddingTop: insets.top + 16, paddingBottom: insets.bottom }]}>
      <View style={styles.header}>
        <Text style={[styles.mono, { color: theme.sealed }]}>{t("chat.onDevice")}</Text>
        <Text style={[styles.mono, { color: status.kind === "error" ? theme.danger : theme.text3 }]}>{statusLine}</Text>
      </View>
      <FlatList
        data={rows}
        keyExtractor={(r) => r.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={[styles.headline, { color: theme.text }]}>{t("onboarding.headline")}</Text>}
        renderItem={({ item }) => (
          <View style={[styles.msg, item.role === "user" ? { backgroundColor: theme.surface1, alignSelf: "flex-end" } : null]}>
            <Text style={{ color: theme.text, fontFamily: fonts.sans, fontSize: 16 }}>{item.content || (item.streaming ? "…" : "")}</Text>
          </View>
        )}
      />
      <View style={[styles.composer, { backgroundColor: theme.well, borderColor: theme.border }]}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder={t("chat.placeholder")}
          placeholderTextColor={theme.text3}
          style={[styles.input, { color: theme.text }]}
          onSubmitEditing={send}
        />
        {abort.current ? (
          <Pressable onPress={() => abort.current?.abort()} style={[styles.btn, { backgroundColor: theme.danger }]}>
            <Text style={{ color: "#fff" }}>{t("chat.stop")}</Text>
          </Pressable>
        ) : (
          <Pressable onPress={send} style={[styles.btn, { backgroundColor: theme.ctaFill }]}>
            <Text style={{ color: theme.ctaText }}>↑</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { alignItems: "center", paddingBottom: 8, gap: 4 },
  mono: { fontFamily: fonts.mono, fontSize: 12, letterSpacing: 1 },
  list: { padding: 16, gap: 10, flexGrow: 1, justifyContent: "flex-end" },
  headline: { fontSize: 24, fontWeight: "600", textAlign: "center", marginBottom: 24 },
  msg: { padding: 12, borderRadius: 14, maxWidth: "88%" },
  composer: { flexDirection: "row", alignItems: "center", margin: 12, borderWidth: 1, borderRadius: 14, paddingLeft: 12 },
  input: { flex: 1, fontSize: 16, paddingVertical: 12 },
  btn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", margin: 4 },
});
