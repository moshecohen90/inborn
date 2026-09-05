import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Modal, Pressable, SectionList, StyleSheet, Switch, Text, TextInput, View, useColorScheme } from "react-native";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { dark, light, fonts, radius } from "@inborn/ui";
import type { Chat, ChatStore } from "@inborn/core";
import { formatWhen } from "../lib/when";

export interface ChatsProps {
  store: ChatStore;
  activeChatId: string | null;
  onClose: () => void;
  onOpenChat: (chat: Chat) => void;
  onNewChat: (incognito: boolean) => void;
  onDeleted: (chatId: string) => void;
}

const UNDO_MS = 5_000;
type Menu = { chat: Chat; renaming: boolean; title: string };
type Pending = { chat: Chat; timer: ReturnType<typeof setTimeout> };
type Section = { key: string; title: string; data: Chat[] };

/** S20 chats drawer + the S21 new-chat sheet reduced to its incognito toggle. */
export function Chats({ store, activeChatId, onClose, onOpenChat, onNewChat, onDeleted }: ChatsProps) {
  const { t, i18n } = useTranslation();
  const theme = useColorScheme() === "light" ? light : dark;
  const insets = useSafeAreaInsets();
  const [chats, setChats] = useState<Chat[]>([]);
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<Set<string> | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [sheet, setSheet] = useState<{ incognito: boolean } | null>(null);
  const [pendingChat, setPendingChat] = useState<Chat | null>(null);
  const pending = useRef<Pending | null>(null);

  const refresh = useCallback(
    () =>
      store
        .listChats()
        .then(setChats)
        .catch((e: unknown) => console.warn("listChats", e)),
    [store],
  );
  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setMatches(null);
      return;
    }
    let alive = true;
    store
      .search(q)
      .then((hits) => {
        if (alive) setMatches(new Set(hits.map((h) => h.chatId)));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [query, store]);

  const commitDelete = useCallback(async () => {
    const p = pending.current;
    if (!p) return;
    clearTimeout(p.timer);
    pending.current = null;
    setPendingChat(null);
    await store.deleteChat(p.chat.id);
    onDeleted(p.chat.id);
    await refresh();
  }, [store, onDeleted, refresh]);
  const commitRef = useRef(commitDelete);
  commitRef.current = commitDelete;
  // Leaving the screen while a delete is still undoable commits it.
  useEffect(() => () => void commitRef.current(), []);

  const requestDelete = (chat: Chat) => {
    setMenu(null);
    void commitDelete();
    pending.current = { chat, timer: setTimeout(() => void commitRef.current(), UNDO_MS) };
    setPendingChat(chat);
  };

  const undo = () => {
    const p = pending.current;
    if (!p) return;
    clearTimeout(p.timer);
    pending.current = null;
    setPendingChat(null);
  };

  const saveRename = async () => {
    if (!menu) return;
    const title = menu.title.trim();
    setMenu(null);
    if (title && title !== menu.chat.title) {
      await store.renameChat(menu.chat.id, title);
      await refresh();
    }
  };

  const startChat = () => {
    const incognito = sheet?.incognito ?? false;
    setSheet(null);
    onNewChat(incognito);
  };

  const visible = useMemo(() => chats.filter((c) => c.id !== pendingChat?.id && (!matches || matches.has(c.id))), [chats, pendingChat, matches]);
  const sections = useMemo<Section[]>(() => {
    const pinned = visible.filter((c) => c.pinned);
    const recent = visible.filter((c) => !c.pinned);
    return [
      ...(pinned.length ? [{ key: "pinned", title: t("chats.pinned"), data: pinned }] : []),
      ...(recent.length ? [{ key: "recent", title: t("chats.recent"), data: recent }] : []),
    ];
  }, [visible, t]);

  return (
    <View style={[styles.root, { backgroundColor: theme.bg, paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <Pressable testID="close-chats" accessibilityRole="button" accessibilityLabel={t("chats.close")} onPress={onClose} hitSlop={8} style={styles.headerBtn}>
          <Text style={[styles.headerGlyph, { color: theme.text2 }]}>✕</Text>
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>{t("chats.title")}</Text>
        <View style={styles.headerBtn} />
      </View>
      <TextInput
        testID="chats-search"
        value={query}
        onChangeText={setQuery}
        placeholder={t("chats.search")}
        placeholderTextColor={theme.text3}
        style={[styles.field, styles.search, { backgroundColor: theme.well, borderColor: theme.border, color: theme.text }]}
      />
      <View style={styles.actions}>
        <Pressable testID="new-chat" accessibilityRole="button" onPress={() => setSheet({ incognito: false })} style={[styles.action, { backgroundColor: theme.surface2, borderColor: theme.border }]}>
          <Text style={[styles.actionText, { color: theme.text }]}>+ {t("chats.new")}</Text>
        </Pressable>
        <Pressable testID="new-incognito" accessibilityRole="button" onPress={() => setSheet({ incognito: true })} style={[styles.action, { backgroundColor: theme.surface2, borderColor: theme.border }]}>
          <Text style={[styles.actionText, { color: theme.text }]}>◐ {t("chats.incognito")}</Text>
        </Pressable>
      </View>
      <SectionList
        sections={sections}
        keyExtractor={(c) => c.id}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={styles.list}
        renderSectionHeader={({ section }) => <Text style={[styles.monoLabel, styles.sectionHeader, { color: theme.text3 }]}>{section.title}</Text>}
        ListEmptyComponent={<Text style={[styles.body, styles.emptyText, { color: theme.text3 }]}>{query.trim() ? t("chats.noResults") : t("chats.empty")}</Text>}
        renderItem={({ item }) => (
          <Pressable
            testID={`chat-row-${item.id}`}
            accessibilityRole="button"
            onPress={() => onOpenChat(item)}
            onLongPress={() => setMenu({ chat: item, renaming: false, title: item.title })}
            style={({ pressed }) => [styles.row, { borderColor: theme.border, backgroundColor: pressed || item.id === activeChatId ? theme.surface1 : "transparent" }]}
          >
            <View style={styles.rowText}>
              <Text numberOfLines={1} style={[styles.body, { color: theme.text }]}>
                {item.incognito ? "◐ " : ""}
                {item.title || t("newChat.title")}
              </Text>
              {item.incognito ? <Text style={[styles.caption, { color: theme.text3 }]}>{t("chats.notSaved")}</Text> : null}
            </View>
            <Text style={[styles.mono, { color: theme.text3 }]}>{formatWhen(item.updatedAt, i18n.language)}</Text>
          </Pressable>
        )}
      />
      {pendingChat ? (
        <View testID="undo-toast" style={[styles.toast, { backgroundColor: theme.surface2, borderColor: theme.border, bottom: insets.bottom + 16 }]}>
          <Text numberOfLines={1} style={[styles.body, styles.toastText, { color: theme.text }]}>
            {t("chats.deleted")}
          </Text>
          <Pressable testID="undo-delete" accessibilityRole="button" onPress={undo} hitSlop={12}>
            <Text style={[styles.body, styles.strong, { color: theme.accent }]}>{t("chats.undo")}</Text>
          </Pressable>
        </View>
      ) : null}

      <Modal visible={sheet !== null} transparent animationType="slide" onRequestClose={() => setSheet(null)}>
        <Pressable style={styles.backdrop} onPress={() => setSheet(null)} />
        <View style={[styles.sheet, { backgroundColor: theme.surface1, borderColor: theme.border, paddingBottom: insets.bottom + 20 }]}>
          <Text style={[styles.title, { color: theme.text }]}>{t("newChat.title")}</Text>
          <View style={styles.switchRow}>
            <View style={styles.rowText}>
              <Text style={[styles.body, { color: theme.text }]}>◐ {t("newChat.incognito")}</Text>
              <Text style={[styles.caption, { color: theme.text2 }]}>{t("chat.incognito.toggleHint")}</Text>
            </View>
            <Switch testID="incognito-switch" value={sheet?.incognito ?? false} onValueChange={(incognito) => setSheet({ incognito })} trackColor={{ true: theme.text2, false: theme.border }} />
          </View>
          <View style={styles.sheetActions}>
            <Pressable accessibilityRole="button" onPress={() => setSheet(null)} style={styles.textBtn}>
              <Text style={[styles.body, { color: theme.text2 }]}>{t("chats.cancel")}</Text>
            </Pressable>
            <Pressable testID="start-chat" accessibilityRole="button" onPress={startChat} style={[styles.cta, { backgroundColor: theme.ctaFill }]}>
              <Text style={[styles.body, styles.strong, { color: theme.ctaText }]}>{t("newChat.start")}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={menu !== null} transparent animationType="fade" onRequestClose={() => setMenu(null)}>
        <Pressable style={styles.backdrop} onPress={() => setMenu(null)} />
        <View style={styles.center} pointerEvents="box-none">
          <View style={[styles.card, { backgroundColor: theme.surface1, borderColor: theme.border }]}>
            {menu?.renaming ? (
              <>
                <TextInput
                  testID="rename-input"
                  autoFocus
                  value={menu.title}
                  onChangeText={(title) => setMenu({ ...menu, title })}
                  onSubmitEditing={saveRename}
                  style={[styles.field, { backgroundColor: theme.well, borderColor: theme.border, color: theme.text }]}
                />
                <View style={styles.sheetActions}>
                  <Pressable accessibilityRole="button" onPress={() => setMenu(null)} style={styles.textBtn}>
                    <Text style={[styles.body, { color: theme.text2 }]}>{t("chats.cancel")}</Text>
                  </Pressable>
                  <Pressable testID="rename-save" accessibilityRole="button" onPress={saveRename} style={[styles.cta, { backgroundColor: theme.ctaFill }]}>
                    <Text style={[styles.body, styles.strong, { color: theme.ctaText }]}>{t("chats.save")}</Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <>
                <Text numberOfLines={1} style={[styles.title, { color: theme.text }]}>
                  {menu?.chat.title}
                </Text>
                <Pressable testID="menu-rename" accessibilityRole="button" onPress={() => menu && setMenu({ ...menu, renaming: true })} style={styles.menuItem}>
                  <Text style={[styles.body, { color: theme.text }]}>{t("chats.rename")}</Text>
                </Pressable>
                <Pressable testID="menu-delete" accessibilityRole="button" onPress={() => menu && requestDelete(menu.chat)} style={styles.menuItem}>
                  <Text style={[styles.body, { color: theme.danger }]}>{t("chats.delete")}</Text>
                </Pressable>
                <Pressable accessibilityRole="button" onPress={() => setMenu(null)} style={styles.menuItem}>
                  <Text style={[styles.body, { color: theme.text2 }]}>{t("chats.cancel")}</Text>
                </Pressable>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const fill = { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 } as const;

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, height: 44 },
  headerBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  headerGlyph: { fontSize: 18 },
  title: { fontFamily: fonts.sans, fontSize: 22, fontWeight: "600", letterSpacing: -0.2 },
  field: { height: 44, borderWidth: 1, borderRadius: radius.control, paddingHorizontal: 12, fontFamily: fonts.sans, fontSize: 16 },
  search: { marginHorizontal: 16, marginTop: 8 },
  actions: { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  action: { flex: 1, height: 44, borderWidth: 1, borderRadius: radius.control, alignItems: "center", justifyContent: "center" },
  actionText: { fontFamily: fonts.sans, fontSize: 16, fontWeight: "500" },
  list: { paddingHorizontal: 16, paddingBottom: 96, flexGrow: 1 },
  sectionHeader: { paddingTop: 12, paddingBottom: 6 },
  monoLabel: { fontFamily: fonts.mono, fontSize: 11, fontWeight: "500", letterSpacing: 0.9, textTransform: "uppercase" },
  mono: { fontFamily: fonts.mono, fontSize: 12 },
  body: { fontFamily: fonts.sans, fontSize: 16, lineHeight: 22 },
  caption: { fontFamily: fonts.sans, fontSize: 12, lineHeight: 16 },
  strong: { fontWeight: "600" },
  emptyText: { textAlign: "center", paddingTop: 48 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56, paddingHorizontal: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  rowText: { flex: 1, gap: 2 },
  toast: { position: "absolute", left: 16, right: 16, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, minHeight: 48, borderWidth: 1, borderRadius: radius.control },
  toastText: { flex: 1 },
  backdrop: { ...fill, backgroundColor: "rgba(0,0,0,0.45)" },
  sheet: { position: "absolute", left: 0, right: 0, bottom: 0, padding: 20, gap: 16, borderTopWidth: 1, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  switchRow: { flexDirection: "row", alignItems: "center", gap: 16 },
  sheetActions: { flexDirection: "row", justifyContent: "flex-end", alignItems: "center", gap: 8 },
  textBtn: { minHeight: 44, paddingHorizontal: 16, justifyContent: "center" },
  cta: { minHeight: 44, paddingHorizontal: 20, borderRadius: radius.control, alignItems: "center", justifyContent: "center" },
  center: { ...fill, alignItems: "center", justifyContent: "center", padding: 24 },
  card: { width: "100%", maxWidth: 360, padding: 16, gap: 4, borderWidth: 1, borderRadius: radius.card },
  menuItem: { minHeight: 44, justifyContent: "center" },
});
