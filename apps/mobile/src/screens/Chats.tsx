import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Modal, Pressable, ScrollView, SectionList, StyleSheet, Text, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon, radius } from "@inborn/ui";
import { BUILT_IN_PERSONAS, DEFAULT_PERSONA_ID, paywallFor, type Chat, type ChatStore, type Folder, type Persona, type SearchHit } from "@inborn/core";
import { formatWhen } from "../lib/when";
import { useEntitlement } from "../licence";
import { modelLabel } from "../lib/models";
import { useShortcut } from "../lib/shortcuts";
import { useTheme } from "../lib/theme";
import { useKeyboardLift } from "../lib/keyboard";
import { getEngine } from "../engine";
import { PersonaGlyph } from "../components/chat/PersonaGlyph";
import { ChipGlyph } from "../components/shell/ChipGlyph";
import { ProTag, Sheet, SheetItem } from "../components/chat/Sheet";
import { shape } from "../components/chat/styles";
import { useType } from "../services/type";
import { Toggle } from "../components/shell/primitives";
import { Fab, FloatingToolbar, GlassFill, materialChrome, panelColor, panelStyle } from "../components/shell/NativeChrome";
import { ExportSheet } from "./chat/ExportSheet";
import { FolderSheet } from "./chat/FolderSheet";
import { VaultCodeSheet, WorkTag, useWork, useWorkGate, type VaultCodeMode } from "../work";
import { MemorySheet } from "./chat/MemorySheet";
import { PersonasSheet } from "./chat/PersonasSheet";
import { SwipeRow } from "./chat/SwipeRow";
import { afterSheetClose } from "./Chat";
import { deviceNoun } from "../lib/deviceNoun";

export interface ChatsProps {
  store: ChatStore;
  activeChatId: string | null;
  onClose: () => void;
  onOpenChat: (chat: Chat) => void;
  onNewChat: (incognito: boolean, personaId?: string) => void;
  onDeleted: (chatId: string) => void;
  /** Folders and "export all" are §12.3 value moments; the host opens S60. */
  onOpenPaywall?: () => void;
}

const UNDO_MS = 5_000;
type Menu = { chat: Chat; renaming: boolean; title: string };
type Pending = { chats: Chat[]; timer: ReturnType<typeof setTimeout> };
type Section = { key: string; title: string; data: Chat[]; folder?: Folder; lockedCount?: number };

/** S20 chats drawer: search with snippets, pinned / folders / recent / archived, swipe actions, bulk delete with undo, S21 new-chat sheet. */
export function Chats({ store, activeChatId, onClose, onOpenChat, onNewChat, onDeleted, onOpenPaywall }: ChatsProps) {
  const type = useType();
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const lift = useKeyboardLift();
  const { tier } = useEntitlement();
  const { model } = getEngine();
  const [chats, setChats] = useState<Chat[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [sheet, setSheet] = useState<{ incognito: boolean; personaId: string } | null>(null);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showArchived, setShowArchived] = useState(false);
  const [folderMode, setFolderMode] = useState<{ kind: "move"; chat: Chat } | { kind: "manage" } | null>(null);
  const { work, version: workVersion } = useWork();
  const workGate = useWorkGate();
  const [vaultCode, setVaultCode] = useState<{ mode: VaultCodeMode; folder: Folder } | null>(null);
  const [exporting, setExporting] = useState<Chat | null>(null);
  const [personasOpen, setPersonasOpen] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const pending = useRef<Pending | null>(null);
  const foldersGated = paywallFor(tier, { kind: "feature", feature: "folders" });
  const unlock = () => onOpenPaywall?.();

  const refresh = useCallback(async () => {
    const [list, dirs, custom] = await Promise.all([store.listChats(), store.library.listFolders(), store.library.listPersonas()]);
    setChats(list);
    setFolders(dirs);
    for (const r of work.records()) if (!dirs.some((f) => f.id === r.folderId)) void work.removeVault(r.folderId);
    setPersonas(custom);
  }, [store]);
  useEffect(() => {
    refresh().catch((e: unknown) => console.warn("listChats", e));
  }, [refresh]);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setHits(null);
      return;
    }
    let alive = true;
    store
      .search(q)
      .then((h) => {
        if (alive) setHits(h);
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
    setPendingIds(new Set());
    await store.deleteChats(p.chats.map((c) => c.id));
    for (const c of p.chats) onDeleted(c.id);
    await refresh();
  }, [store, onDeleted, refresh]);
  const commitRef = useRef(commitDelete);
  commitRef.current = commitDelete;
  // Leaving the screen while a delete is still undoable commits it.
  useEffect(() => () => void commitRef.current(), []);

  const requestDelete = (targets: Chat[]) => {
    setMenu(null);
    void commitDelete();
    pending.current = { chats: targets, timer: setTimeout(() => void commitRef.current(), UNDO_MS) };
    setPendingIds(new Set(targets.map((c) => c.id)));
    setSelecting(false);
    setSelected(new Set());
  };

  const undo = () => {
    const p = pending.current;
    if (!p) return;
    clearTimeout(p.timer);
    pending.current = null;
    setPendingIds(new Set());
  };

  const patch = async (chat: Chat, change: Parameters<ChatStore["updateChat"]>[1]) => {
    setMenu(null);
    await store.updateChat(chat.id, change);
    await refresh();
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

  // Desktop ⌘N / ⇧⌘I (spec §8.9): open the new-chat sheet, or flip its incognito switch when it is already up.
  useShortcut("new-chat", () => setSheet({ incognito: false, personaId: DEFAULT_PERSONA_ID }));
  useShortcut("toggle-incognito", () => setSheet((s) => ({ incognito: !s?.incognito, personaId: s?.personaId ?? DEFAULT_PERSONA_ID })));

  const startChat = () => {
    const s = sheet;
    setSheet(null);
    if (!s) return;
    onNewChat(s.incognito, s.personaId === DEFAULT_PERSONA_ID ? undefined : s.personaId);
  };

  const visible = useMemo(() => chats.filter((c) => !pendingIds.has(c.id)), [chats, pendingIds]);
  const sections = useMemo<Section[]>(() => {
    const live = visible.filter((c) => !c.archived);
    const pinned = live.filter((c) => c.pinned);
    const inFolder = (f: Folder) => live.filter((c) => !c.pinned && c.folderId === f.id);
    const recent = live.filter((c) => !c.pinned && (!c.folderId || !folders.some((f) => f.id === c.folderId)));
    const archived = visible.filter((c) => c.archived);
    return [
      ...(pinned.length ? [{ key: "pinned", title: t("chats.pinned"), data: pinned }] : []),
      ...folders.map((f) => (work.isHidden({ folderId: f.id }) ? { key: `folder-${f.id}`, title: f.name, data: [], folder: f, lockedCount: inFolder(f).length } : { key: `folder-${f.id}`, title: f.name, data: inFolder(f), folder: f })).filter((s) => s.data.length || s.lockedCount),
      ...(recent.length ? [{ key: "recent", title: t("chats.recent"), data: recent }] : []),
      ...(archived.length ? [{ key: "archived", title: t("chats.archived", { count: archived.length }), data: showArchived ? archived : [] }] : []),
    ];
  }, [visible, folders, showArchived, t, work, workVersion]);
  const searchResults = useMemo(() => {
    if (!hits) return null;
    const byChat = new Map<string, { chat: Chat; snippets: string[] }>();
    for (const h of hits) {
      const chat = visible.find((c) => c.id === h.chatId);
      if (!chat) continue;
      const entry = byChat.get(h.chatId) ?? { chat, snippets: [] };
      if (h.messageId && entry.snippets.length < 2) entry.snippets.push(h.snippet);
      byChat.set(h.chatId, entry);
    }
    return [...byChat.values()];
  }, [hits, visible]);

  const toggleSelect = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const allPersonas = [...BUILT_IN_PERSONAS, ...personas];
  const personaName = (p: Persona) => (p.builtIn ? t(`persona.${p.id.replace("builtin:", "")}`) : p.name);

  const renderRow = (item: Chat) => {
    const row = (
      <Pressable
        testID={`chat-row-${item.id}`}
        accessibilityRole="button"
        accessibilityState={selecting ? { selected: selected.has(item.id) } : undefined}
        onPress={() => (selecting ? toggleSelect(item.id) : onOpenChat(item))}
        onLongPress={() => (selecting ? undefined : setMenu({ chat: item, renaming: false, title: item.title }))}
        style={({ pressed }) => [styles.row, { borderColor: theme.border, backgroundColor: pressed || item.id === activeChatId ? theme.surface1 : theme.bg }]}
      >
        {selecting ? (
          <View style={[styles.check, { borderColor: selected.has(item.id) ? theme.accent : theme.border, backgroundColor: selected.has(item.id) ? theme.accent : "transparent" }]}>
            {selected.has(item.id) ? <Icon name="check" size={14} color={theme.bg} strokeWidth={3} /> : null}
          </View>
        ) : null}
        <View style={styles.rowText}>
          <View style={styles.titleRow}>
            {item.incognito ? <Icon name="incognito" size={16} color={theme.text2} /> : item.pinned ? <Icon name="pin" size={14} color={theme.text3} /> : null}
            <Text numberOfLines={1} style={[type.body, styles.titleText, { color: theme.text }]}>
              {item.title || t("newChat.title")}
            </Text>
          </View>
          {item.incognito ? <Text style={[type.caption, { color: theme.text3 }]}>{t("chats.notSaved")}</Text> : null}
        </View>
        <Text style={[type.mono, { color: theme.text3 }]}>{formatWhen(item.updatedAt, i18n.language)}</Text>
      </Pressable>
    );
    if (selecting || item.incognito) return row;
    return (
      <SwipeRow
        actions={[
          { key: "pin", testID: `swipe-pin-${item.id}`, label: item.pinned ? t("chats.unpin") : t("chats.pin"), color: theme.accent, onPress: () => void patch(item, { pinned: !item.pinned }) },
          { key: "archive", testID: `swipe-archive-${item.id}`, label: item.archived ? t("chats.unarchive") : t("chats.archive"), color: theme.text2, onPress: () => void patch(item, { archived: !item.archived, pinned: false }) },
          { key: "delete", testID: `swipe-delete-${item.id}`, label: t("chats.delete"), color: theme.danger, onPress: () => requestDelete([item]) },
        ]}
      >
        {row}
      </SwipeRow>
    );
  };

  return (
    <View style={[styles.root, { backgroundColor: theme.bg, paddingTop: insets.top + 8 }]}>
      <FloatingToolbar style={styles.header}>
        <Pressable testID="close-chats" accessibilityRole="button" accessibilityLabel={t("chats.close")} onPress={onClose} hitSlop={8} style={styles.headerBtn}>
          <Icon name="x" size={20} color={theme.text2} />
        </Pressable>
        <Text style={[type.title, { color: theme.text }]}>{t("chats.title")}</Text>
        <Pressable
          testID="select-toggle"
          accessibilityRole="button"
          onPress={() => {
            setSelecting((s) => !s);
            setSelected(new Set());
          }}
          hitSlop={8}
          style={styles.headerBtn}
        >
          <Text style={[type.bodySmall, { color: theme.text2 }]}>{selecting ? t("chats.cancel") : t("chats.select")}</Text>
        </Pressable>
      </FloatingToolbar>
      <TextInput testID="chats-search" value={query} onChangeText={setQuery} placeholder={t("chats.search")} placeholderTextColor={theme.text3} style={[shape.field, styles.search, { backgroundColor: theme.well, borderColor: theme.border, color: theme.text }]} accessibilityLabel={t("chats.search")} />
      {!selecting ? (
        <View style={styles.actions}>
          {/* Android: the new-chat FAB (§9.7) owns this action, so the row keeps only incognito. */}
          {materialChrome ? null : (
            <Pressable testID="new-chat" accessibilityRole="button" onPress={() => setSheet({ incognito: false, personaId: DEFAULT_PERSONA_ID })} style={[shape.control, styles.action, { backgroundColor: theme.surface2, borderColor: theme.border }]}>
              <Icon name="plus" size={18} color={theme.text} />
              <Text style={[type.body, type.strong, { color: theme.text }]}>{t("chats.new")}</Text>
            </Pressable>
          )}
          <Pressable testID="new-incognito" accessibilityRole="button" onPress={() => setSheet({ incognito: true, personaId: DEFAULT_PERSONA_ID })} style={[shape.control, styles.action, { backgroundColor: theme.surface2, borderColor: theme.border }]}>
            <Icon name="incognito" size={18} color={theme.text} />
            <Text style={[type.body, type.strong, { color: theme.text }]}>{t("chats.incognito")}</Text>
          </Pressable>
        </View>
      ) : null}
      <View style={styles.listArea}>
      {searchResults ? (
        <ScrollView contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
          {searchResults.length ? (
            searchResults.map(({ chat, snippets }) => (
              <Pressable key={chat.id} testID={`hit-${chat.id}`} accessibilityRole="button" onPress={() => onOpenChat(chat)} style={({ pressed }) => [styles.row, styles.hit, { borderColor: theme.border, backgroundColor: pressed ? theme.surface1 : "transparent" }]}>
                <View style={styles.rowText}>
                  <Text numberOfLines={1} style={[type.body, { color: theme.text }]}>
                    {chat.title || t("newChat.title")}
                  </Text>
                  {snippets.map((s, i) => (
                    <Text key={i} numberOfLines={2} style={[type.caption, { color: theme.text2 }]}>
                      {s}
                    </Text>
                  ))}
                </View>
                <Text style={[type.mono, { color: theme.text3 }]}>{formatWhen(chat.updatedAt, i18n.language)}</Text>
              </Pressable>
            ))
          ) : (
            <Text style={[type.body, styles.emptyText, { color: theme.text3 }]}>{t("chats.noResults")}</Text>
          )}
        </ScrollView>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(c) => c.id}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          renderSectionHeader={({ section }) =>
            section.key === "archived" ? (
              <Pressable testID="toggle-archived" accessibilityRole="button" accessibilityState={{ expanded: showArchived }} onPress={() => setShowArchived((s) => !s)} style={styles.sectionHeader}>
                <View style={styles.sectionRow}>
                  <Icon name={showArchived ? "chevronDown" : "chevronRight"} size={14} color={theme.text3} />
                  <Text style={[type.monoLabel, { color: theme.text3 }]}>{section.title}</Text>
                </View>
              </Pressable>
            ) : (
              <View style={[styles.sectionHeader, styles.sectionRow]}>
                {section.folder ? <Icon name="chevronRight" size={14} color={theme.text3} /> : null}
                <Text style={[type.monoLabel, { color: theme.text3 }]}>{section.title}</Text>
                {section.folder && work.isVault(section.folder.id) ? (
                  <Pressable
                    testID={`vault-${section.folder.id}`}
                    accessibilityRole="button"
                    accessibilityLabel={section.lockedCount ? t("vaults.unlock") : t("vaults.lock")}
                    hitSlop={8}
                    onPress={() => {
                      const folder = section.folder!;
                      if (section.lockedCount) setVaultCode({ mode: { kind: "verify", folderName: folder.name }, folder });
                      else void work.lock(folder.id);
                    }}
                    style={[shape.chip, { borderColor: section.lockedCount ? theme.text3 : theme.sealed, minHeight: 22 }]}
                  >
                    <Text style={[type.monoLabel, { color: section.lockedCount ? theme.text3 : theme.sealed }]}>{section.lockedCount ? t("vaults.locked") : t("vaults.badge")}</Text>
                  </Pressable>
                ) : null}
                {section.lockedCount ? <Text style={[type.caption, { color: theme.text3 }]}>{t("vaults.lockedRow", { count: section.lockedCount })}</Text> : null}
              </View>
            )
          }
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Text style={[type.body, styles.emptyText, { color: theme.text3 }]}>{t("chats.empty")}</Text>
              <Text style={[type.caption, styles.emptyText, { color: theme.text3 }]}>{t("chats.emptyHint", { device: deviceNoun() })}</Text>
            </View>
          }
          renderItem={({ item }) => renderRow(item)}
        />
      )}
      {materialChrome && !selecting ? <Fab testID="new-chat" icon="plus" label={t("chats.new")} onPress={() => setSheet({ incognito: false, personaId: DEFAULT_PERSONA_ID })} /> : null}
      </View>
      {selecting ? (
        <View style={[styles.bulkBar, { backgroundColor: theme.surface1, borderColor: theme.border, paddingBottom: insets.bottom + 8 }]}>
          <Pressable testID="select-all" accessibilityRole="button" onPress={() => setSelected(new Set(visible.map((c) => c.id)))} style={shape.control}>
            <Text style={[type.body, { color: theme.text2 }]}>{t("chats.selectAll")}</Text>
          </Pressable>
          <Pressable testID="bulk-delete" accessibilityRole="button" disabled={!selected.size} onPress={() => requestDelete(visible.filter((c) => selected.has(c.id)))} style={[shape.control, { backgroundColor: theme.danger, opacity: selected.size ? 1 : 0.45 }]}>
            <Text style={[type.body, type.strong, { color: theme.onDanger }]}>{t("chats.deleteCount", { count: selected.size })}</Text>
          </Pressable>
        </View>
      ) : (
        <View style={[styles.footer, { borderColor: theme.border, paddingBottom: insets.bottom + 8 }]}>
          <View style={[shape.chip, styles.titleRow, { backgroundColor: theme.surface2, borderColor: theme.border }]}>
            <ChipGlyph size={12} color={theme.text2} />
            <Text style={[type.monoLabel, { color: theme.text2 }]}>{modelLabel(model.id)}</Text>
          </View>
          <Pressable testID="open-personas" accessibilityRole="button" onPress={() => setPersonasOpen(true)} style={styles.footerBtn}>
            <Text style={[type.bodySmall, { color: theme.text2 }]}>{t("personas.title")}</Text>
          </Pressable>
          <Pressable testID="open-memory" accessibilityRole="button" onPress={() => setMemoryOpen(true)} style={styles.footerBtn}>
            <Text style={[type.bodySmall, { color: theme.text2 }]}>{t("memory.title")}</Text>
          </Pressable>
          <Pressable testID="open-folders" accessibilityRole="button" onPress={() => (foldersGated ? unlock() : setFolderMode({ kind: "manage" }))} style={styles.footerBtn}>
            <Text style={[type.bodySmall, { color: theme.text2 }]}>{t("folders.title")}</Text>
          </Pressable>
          {foldersGated ? <ProTag onPress={unlock} /> : null}
        </View>
      )}
      {pendingIds.size ? (
        <View testID="undo-toast" style={[styles.toast, { backgroundColor: theme.surface2, borderColor: theme.border, bottom: insets.bottom + 72 }]}>
          <Text numberOfLines={1} style={[type.body, styles.toastText, { color: theme.text }]}>
            {pendingIds.size === 1 ? t("chats.deletedOne") : t("chats.deletedMany", { count: pendingIds.size })}
          </Text>
          <Pressable testID="undo-delete" accessibilityRole="button" onPress={undo} hitSlop={12}>
            <Text style={[type.body, type.strong, { color: theme.accent }]}>{t("chats.undo")}</Text>
          </Pressable>
        </View>
      ) : null}

      <Sheet visible={sheet !== null} onClose={() => setSheet(null)} title={sheet?.incognito ? t("chats.incognito") : t("newChat.title")} testID="new-chat-sheet">
        <View style={styles.sheetBody}>
          <Text style={[type.monoLabel, { color: theme.text3 }]}>{t("newChat.persona")}</Text>
          <View style={styles.personaWrap}>
            {allPersonas.map((p) => {
              const active = sheet?.personaId === p.id;
              return (
                <Pressable key={p.id} testID={`persona-chip-${p.id}`} accessibilityRole="radio" accessibilityState={{ selected: active }} onPress={() => sheet && setSheet({ ...sheet, personaId: p.id })} style={[shape.chip, styles.personaChip, { borderColor: active ? theme.accent : theme.border, backgroundColor: theme.surface2 }]}>
                  <PersonaGlyph icon={p.icon} size={22} active={active} />
                  <Text style={[type.bodySmall, { color: active ? theme.accent : theme.text }]}>{personaName(p)}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={[type.monoLabel, { color: theme.text3 }]}>{t("newChat.model")}</Text>
          <View style={[shape.chip, styles.modelChip, styles.titleRow, { backgroundColor: theme.surface2, borderColor: theme.accent }]}>
            <ChipGlyph size={12} color={theme.text2} />
            <Text style={[type.monoLabel, { color: theme.text2 }]}>
              {modelLabel(model.id)} · {t("newChat.fits")}
            </Text>
          </View>
          <View style={styles.switchRow}>
            <View style={styles.rowText}>
              <View style={styles.titleRow}>
                <Icon name="incognito" size={16} color={theme.text2} />
                <Text style={[type.body, { color: theme.text }]}>{t("newChat.incognito")}</Text>
              </View>
              <Text style={[type.caption, { color: theme.text2 }]}>{t("chat.incognito.toggleHint")}</Text>
            </View>
            <Toggle
              testID="incognito-switch"
              value={sheet?.incognito ?? false}
              onChange={(incognito) => {
                if (sheet) setSheet({ ...sheet, incognito });
              }}
            />
          </View>
          <View style={styles.sheetActions}>
            <Pressable accessibilityRole="button" onPress={() => setSheet(null)} style={shape.control}>
              <Text style={[type.body, { color: theme.text2 }]}>{t("chats.cancel")}</Text>
            </Pressable>
            <Pressable testID="start-chat" accessibilityRole="button" onPress={startChat} style={[shape.control, { backgroundColor: theme.ctaFill }]}>
              <Text style={[type.body, type.strong, { color: theme.ctaText }]}>{t("newChat.start")}</Text>
            </Pressable>
          </View>
        </View>
      </Sheet>

      <Modal visible={menu !== null} transparent animationType="fade" onRequestClose={() => setMenu(null)}>
        <Pressable style={[shape.fill, styles.backdrop]} onPress={() => setMenu(null)} />
        <View style={[styles.center, { paddingBottom: 24 + lift }]} pointerEvents="box-none">
          <View style={[shape.card, styles.card, panelStyle, { backgroundColor: panelColor(theme.surface1), borderColor: theme.border }]}>
            <GlassFill />
            {menu?.renaming ? (
              <>
                <TextInput testID="rename-input" autoFocus value={menu.title} onChangeText={(title) => setMenu({ ...menu, title })} onSubmitEditing={saveRename} style={[shape.field, { backgroundColor: theme.well, borderColor: theme.border, color: theme.text }]} />
                <View style={styles.sheetActions}>
                  <Pressable accessibilityRole="button" onPress={() => setMenu(null)} style={shape.control}>
                    <Text style={[type.body, { color: theme.text2 }]}>{t("chats.cancel")}</Text>
                  </Pressable>
                  <Pressable testID="rename-save" accessibilityRole="button" onPress={saveRename} style={[shape.control, { backgroundColor: theme.ctaFill }]}>
                    <Text style={[type.body, type.strong, { color: theme.ctaText }]}>{t("chats.save")}</Text>
                  </Pressable>
                </View>
              </>
            ) : menu ? (
              <>
                <Text numberOfLines={1} style={[type.title, { color: theme.text }]}>
                  {menu.chat.title || t("newChat.title")}
                </Text>
                <SheetItem testID="menu-rename" label={t("chats.rename")} onPress={() => setMenu({ ...menu, renaming: true })} />
                {!menu.chat.incognito ? (
                  <>
                    <SheetItem testID="menu-pin" label={menu.chat.pinned ? t("chats.unpin") : t("chats.pin")} onPress={() => void patch(menu.chat, { pinned: !menu.chat.pinned })} />
                    <SheetItem testID="menu-archive" label={menu.chat.archived ? t("chats.unarchive") : t("chats.archive")} onPress={() => void patch(menu.chat, { archived: !menu.chat.archived, pinned: false })} />
                    <SheetItem
                      testID="menu-move"
                      label={t("folders.move")}
                      trailing={foldersGated ? <ProTag onPress={() => {
                        setMenu(null);
                        afterSheetClose(unlock);
                      }} /> : undefined}
                      onPress={() => {
                        const chat = menu.chat;
                        setMenu(null);
                        afterSheetClose(() => (foldersGated ? unlock() : setFolderMode({ kind: "move", chat })));
                      }}
                    />
                    <SheetItem
                      testID="menu-export"
                      label={t("export.title")}
                      onPress={() => {
                        const chat = menu.chat;
                        setMenu(null);
                        afterSheetClose(() => setExporting(chat));
                      }}
                    />
                  </>
                ) : null}
                <SheetItem testID="menu-delete" label={t("chats.delete")} danger onPress={() => requestDelete([menu.chat])} />
                <SheetItem label={t("chats.cancel")} onPress={() => setMenu(null)} />
              </>
            ) : null}
          </View>
        </View>
      </Modal>

      <FolderSheet
        mode={folderMode}
        onClose={() => setFolderMode(null)}
        store={store}
        onChanged={() => void refresh()}
        canMoveTo={(f) => !work.isHidden({ folderId: f.id })}
        onMoved={(chat, from, to) => {
          if (to) void work.log(to, "chat.moved-in", { chatId: chat.id, title: chat.title });
          if (from) void work.log(from, "chat.moved-out", { chatId: chat.id, title: chat.title });
        }}
        extraAction={(f) =>
          work.isVault(f.id) ? (
            <>
              <Pressable testID={`vault-code-${f.id}`} accessibilityRole="button" hitSlop={6} style={styles.footerBtn} onPress={() => { setFolderMode(null); afterSheetClose(() => setVaultCode({ mode: { kind: "change", folderName: f.name }, folder: f })); }}>
                <Text style={[type.caption, { color: theme.accent }]}>{t("vaults.code")}</Text>
              </Pressable>
              <Pressable testID={`vault-remove-${f.id}`} accessibilityRole="button" hitSlop={6} style={styles.footerBtn} onPress={() => void work.removeVault(f.id).then(() => refresh())}>
                <Text style={[type.caption, { color: theme.danger }]}>{t("vaults.unvault")}</Text>
              </Pressable>
            </>
          ) : workGate.vaultsLocked ? (
            <WorkTag onPress={() => { setFolderMode(null); afterSheetClose(unlock); }} />
          ) : (
            <Pressable testID={`vault-make-${f.id}`} accessibilityRole="button" hitSlop={6} style={styles.footerBtn} onPress={() => { setFolderMode(null); afterSheetClose(() => setVaultCode({ mode: { kind: "set", folderName: f.name }, folder: f })); }}>
              <Text style={[type.caption, { color: theme.accent }]}>{t("vaults.make")}</Text>
            </Pressable>
          )
        }
      />
      <VaultCodeSheet
        mode={vaultCode?.mode ?? null}
        onClose={() => setVaultCode(null)}
        onSubmit={async (code) => {
          const v = vaultCode;
          if (!v) return false;
          const ok = v.mode.kind === "verify" ? await work.unlock(v.folder.id, code) : v.mode.kind === "set" ? await work.createVault(v.folder.id, code, v.folder.name) : await work.changeCode(v.folder.id, code);
          if (ok) setVaultCode(null);
          return ok;
        }}
      />
      <ExportSheet chat={exporting} onClose={() => setExporting(null)} store={store} onUnlock={unlock} />
      <PersonasSheet visible={personasOpen} onClose={() => setPersonasOpen(false)} store={store} onChanged={() => void refresh()} onUnlock={unlock} />
      <MemorySheet visible={memoryOpen} onClose={() => setMemoryOpen(false)} store={store} onUnlock={unlock} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, minHeight: 44 },
  headerBtn: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
  search: { marginHorizontal: 16, marginTop: 8 },
  actions: { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  action: { flex: 1, borderWidth: 1, flexDirection: "row", gap: 8 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  titleText: { flexShrink: 1 },
  sectionRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  listArea: { flex: 1 },
  list: { paddingHorizontal: 16, paddingBottom: 96, flexGrow: 1 },
  sectionHeader: { paddingTop: 12, paddingBottom: 6, minHeight: 32, justifyContent: "center" },
  emptyWrap: { paddingTop: 48, gap: 8 },
  emptyText: { textAlign: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56, paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  hit: { alignItems: "flex-start", paddingVertical: 10 },
  rowText: { flex: 1, gap: 2 },
  check: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  bulkBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingTop: 8, borderTopWidth: 1 },
  footer: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, flexWrap: "wrap" },
  footerBtn: { minHeight: 44, paddingHorizontal: 6, justifyContent: "center" },
  toast: { position: "absolute", left: 16, right: 16, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, minHeight: 48, borderWidth: 1, borderRadius: radius.control },
  toastText: { flex: 1 },
  backdrop: { backgroundColor: "rgba(0,0,0,0.45)" },
  sheetBody: { paddingHorizontal: 12, gap: 12, paddingBottom: 8 },
  personaWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  personaChip: { flexDirection: "row", gap: 8, minHeight: 36, paddingLeft: 6, paddingRight: 14 },
  modelChip: { alignSelf: "flex-start", minHeight: 32 },
  switchRow: { flexDirection: "row", alignItems: "center", gap: 16 },
  sheetActions: { flexDirection: "row", justifyContent: "flex-end", alignItems: "center", gap: 4 },
  center: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center", padding: 24 },
  card: { width: "100%", maxWidth: 360, gap: 4 },
});
