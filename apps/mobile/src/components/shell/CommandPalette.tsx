import { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { radius } from "@inborn/ui";
import type { Chat } from "@inborn/core";

import { useAppServices } from "../../services/AppServices";
import { useTheme } from "../../services/theme";
import { useType } from "../../services/type";
import { useOpenSheet } from "../../lib/openSheets";
import { hasPanel } from "../../lib/layout";
import { useLayoutMode } from "../../lib/useLayout";
import { openSidePanel } from "../../lib/sidePanel";

interface Item {
  key: string;
  label: string;
  run: () => void;
}

const MAX_CHATS = 8;

/** Command palette (spec §8.9, Cmd/Ctrl+K): the screens of the sidebar and the recent chats, filtered by one line of text. No animation. */
export function CommandPalette({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const s = useAppServices();
  const router = useRouter();
  const { t } = useTranslation();
  const { theme } = useTheme();
  const type = useType();
  const mode = useLayoutMode();
  const [query, setQuery] = useState("");
  const [chats, setChats] = useState<Chat[]>([]);
  useOpenSheet(visible, onClose);

  useEffect(() => {
    if (!visible) return setQuery("");
    let alive = true;
    void s.store
      .listChats()
      .then((list) => alive && setChats(list))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [visible, s.store, s.chatsVersion]);

  const go = (run: () => void) => () => {
    onClose();
    run();
  };

  const screens: Item[] = useMemo(
    () => [
      { key: "new-chat", label: t("chats.new"), run: () => s.newChat(false) },
      { key: "incognito", label: t("chats.incognito"), run: () => s.newChat(true) },
      { key: "documents", label: t("documents.title"), run: () => (hasPanel(mode) ? openSidePanel({ kind: "documents" }) : router.push("/documents")) },
      { key: "vault", label: t("vault.title"), run: () => router.push("/vault") },
      { key: "proof", label: t("proof.title"), run: () => router.push("/proof") },
      { key: "settings", label: t("settings.title"), run: () => router.push("/settings") },
    ],
    [t, s, router, mode],
  );

  const q = query.trim().toLowerCase();
  const matches = (label: string) => !q || label.toLowerCase().includes(q);
  const screenHits = screens.filter((i) => matches(i.label));
  const chatHits = chats
    .filter((c) => matches(c.title ?? ""))
    .slice(0, MAX_CHATS)
    .map<Item>((c) => ({ key: `chat:${c.id}`, label: c.title || t("chats.title"), run: () => s.openChat(c) }));
  const all = [...screenHits, ...chatHits];

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Pressable accessibilityRole="button" accessibilityLabel={t("chats.close")} style={styles.backdrop} onPress={onClose} />
      <View pointerEvents="box-none" style={styles.centre}>
        <View testID="command-palette" style={[styles.panel, { backgroundColor: theme.surface1, borderColor: theme.border }]}>
          <TextInput
            testID="palette-input"
            autoFocus
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={all.length ? go(all[0]!.run) : onClose}
            placeholder={t("desktop.palette.placeholder")}
            placeholderTextColor={theme.text3}
            style={[type.body, styles.input, { color: theme.text, borderBottomColor: theme.border }]}
            accessibilityLabel={t("desktop.palette.placeholder")}
          />
          <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
            {screenHits.length ? <Text style={[type.monoLabel, styles.group, { color: theme.text3 }]}>{t("desktop.palette.screens")}</Text> : null}
            {screenHits.map((i) => (
              <Row key={i.key} item={i} onRun={go(i.run)} />
            ))}
            {chatHits.length ? <Text style={[type.monoLabel, styles.group, { color: theme.text3 }]}>{t("desktop.palette.chats")}</Text> : null}
            {chatHits.map((i) => (
              <Row key={i.key} item={i} onRun={go(i.run)} />
            ))}
            {all.length ? null : <Text style={[type.body, styles.empty, { color: theme.text3 }]}>{t("chats.noResults")}</Text>}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function Row({ item, onRun }: { item: Item; onRun: () => void }) {
  const { theme } = useTheme();
  const type = useType();
  return (
    <Pressable testID={`palette-${item.key}`} accessibilityRole="button" onPress={onRun} style={({ pressed }) => [styles.row, { backgroundColor: pressed ? theme.surface2 : "transparent" }]}>
      <Text numberOfLines={1} style={[type.body, { color: theme.text }]}>
        {item.label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.45)" },
  centre: { flex: 1, alignItems: "center", paddingTop: 96, paddingHorizontal: 24 },
  panel: { width: "100%", maxWidth: 560, maxHeight: 420, borderWidth: 1, borderRadius: radius.card, overflow: "hidden" },
  input: { height: 48, paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  list: { flexShrink: 1 },
  group: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4 },
  row: { minHeight: 40, justifyContent: "center", paddingHorizontal: 16 },
  empty: { padding: 16 },
});
