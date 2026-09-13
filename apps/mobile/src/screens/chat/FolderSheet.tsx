import { useEffect, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import type { Chat, ChatStore, Folder } from "@inborn/core";
import { useTheme } from "../../lib/theme";
import { Sheet, SheetItem } from "../../components/chat/Sheet";
import { shape } from "../../components/chat/styles";
import { useType } from "../../services/type";
import { Icon } from "@inborn/ui";

interface Props {
  /** `move` picks a folder for the chat; `manage` creates, renames and deletes folders. */
  mode: { kind: "move"; chat: Chat } | { kind: "manage" } | null;
  onClose: () => void;
  store: ChatStore;
  onChanged: () => void;
  /** Work stream: per-folder vault controls in the manage list. */
  extraAction?: (folder: Folder) => ReactNode;
  /** A folder the chat may not be moved into right now (a locked vault). */
  canMoveTo?: (folder: Folder) => boolean;
  /** After a move (for the vault audit log): previous folder, new folder or null for the root. */
  onMoved?: (chat: Chat, from: string | undefined, to: string | null) => void;
  /** Work stream: a locked vault asks for its code before the action runs (QA F17); default runs at once. */
  beforeAction?: (folder: Folder, action: "rename" | "delete" | "move-out", run: () => void) => void;
}

/** Folder management and "Move to folder" (§8.3 S20). Gating is decided by the caller; the sheet only does the work. */
export function FolderSheet({ mode, onClose, store, onChanged, extraAction, canMoveTo, onMoved, beforeAction }: Props) {
  const type = useType();
  const theme = useTheme();
  const { t } = useTranslation();
  const [folders, setFolders] = useState<Folder[]>([]);
  const [draft, setDraft] = useState<{ id?: string; name: string } | null>(null);
  const refresh = () => store.library.listFolders().then(setFolders).catch(() => undefined);
  useEffect(() => {
    if (mode) void refresh();
    else setDraft(null);
  }, [mode]);

  const commit = async () => {
    if (!draft) return;
    const name = draft.name.trim();
    if (name) {
      if (draft.id) await store.library.renameFolder(draft.id, name);
      else {
        const f = await store.library.createFolder(name);
        if (mode?.kind === "move") {
          await store.updateChat(mode.chat.id, { folderId: f.id });
          onMoved?.(mode.chat, mode.chat.folderId, f.id);
          onChanged();
          onClose();
          return;
        }
      }
    }
    setDraft(null);
    await refresh();
    onChanged();
  };
  const guard = (folderId: string | undefined, action: "rename" | "delete" | "move-out", run: () => void) => {
    const folder = folders.find((f) => f.id === folderId);
    if (folder && beforeAction) beforeAction(folder, action, run);
    else run();
  };
  const move = async (folderId: string | null) => {
    if (mode?.kind !== "move") return;
    if (folderId === (mode.chat.folderId ?? null)) return onClose();
    const chat = mode.chat;
    guard(chat.folderId, "move-out", () => {
      void store.updateChat(chat.id, { folderId }).then(() => {
        onMoved?.(chat, chat.folderId, folderId);
        onChanged();
        onClose();
      });
    });
  };
  const remove = (id: string) =>
    guard(id, "delete", () => {
      void store.library.deleteFolder(id).then(refresh).then(onChanged);
    });

  return (
    <Sheet visible={mode !== null} onClose={onClose} title={mode?.kind === "move" ? t("folders.moveTitle") : t("folders.title")} testID="folder-sheet">
      {mode?.kind === "move" ? <SheetItem testID="folder-none" label={t("folders.none")} onPress={() => void move(null)} trailing={!mode.chat.folderId ? <Icon name="check" size={16} color={theme.accent} /> : undefined} /> : null}
      {folders.map((f) =>
        mode?.kind === "move" ? (
          <SheetItem key={f.id} testID={`folder-pick-${f.id}`} label={f.name} hint={canMoveTo && !canMoveTo(f) ? t("vaults.lockedHint") : undefined} disabled={canMoveTo ? !canMoveTo(f) : false} onPress={() => void move(f.id)} trailing={mode.chat.folderId === f.id ? <Icon name="check" size={16} color={theme.accent} /> : undefined} />
        ) : (
          <View key={f.id} style={styles.manageRow}>
            <Text style={[type.body, styles.grow, { color: theme.text }]}>{f.name}</Text>
            {extraAction?.(f)}
            <Pressable testID={`folder-rename-${f.id}`} accessibilityRole="button" onPress={() => guard(f.id, "rename", () => setDraft({ id: f.id, name: f.name }))} hitSlop={6} style={styles.textBtn}>
              <Text style={[type.caption, { color: theme.accent }]}>{t("chats.rename")}</Text>
            </Pressable>
            <Pressable testID={`folder-delete-${f.id}`} accessibilityRole="button" onPress={() => remove(f.id)} hitSlop={6} style={styles.textBtn}>
              <Text style={[type.caption, { color: theme.danger }]}>{t("chats.delete")}</Text>
            </Pressable>
          </View>
        ),
      )}
      {!folders.length && mode?.kind === "manage" ? <Text style={[type.bodySmall, styles.empty, { color: theme.text3 }]}>{t("folders.empty")}</Text> : null}
      {draft ? (
        <View style={styles.editor}>
          <TextInput testID="folder-name" autoFocus value={draft.name} onChangeText={(name) => setDraft({ ...draft, name })} placeholder={t("folders.name")} placeholderTextColor={theme.text3} onSubmitEditing={() => void commit()} style={[shape.field, { backgroundColor: theme.well, borderColor: theme.border, color: theme.text }]} />
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" onPress={() => setDraft(null)} style={shape.control}>
              <Text style={[type.body, { color: theme.text2 }]}>{t("chats.cancel")}</Text>
            </Pressable>
            <Pressable testID="folder-save" accessibilityRole="button" onPress={() => void commit()} style={[shape.control, { backgroundColor: theme.ctaFill }]}>
              <Text style={[type.body, type.strong, { color: theme.ctaText }]}>{t("chats.save")}</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <SheetItem testID="folder-new" label={t("folders.new")} onPress={() => setDraft({ name: "" })} />
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  manageRow: { flexDirection: "row", alignItems: "center", gap: 16, minHeight: 48, paddingHorizontal: 12 },
  grow: { flex: 1 },
  textBtn: { minHeight: 32, justifyContent: "center" },
  empty: { paddingHorizontal: 12, paddingVertical: 8 },
  editor: { paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: 4 },
});
