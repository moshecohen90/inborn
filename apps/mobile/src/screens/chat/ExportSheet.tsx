import { useTranslation } from "react-i18next";
import { exportChat, type Chat, type ChatStore, type ExportFormat } from "@inborn/core";
import { shareFile } from "../../lib/share";
import { modelNames } from "../../lib/models";
import { Sheet, SheetItem } from "../../components/chat/Sheet";
import { afterSheetClose } from "../Chat";

interface Props {
  chat: Chat | null;
  onClose: () => void;
  store: ChatStore;
}

const FORMATS: ExportFormat[] = ["markdown", "text", "json"];

/** Single-chat export through the system share sheet (§7.1). Incognito chats never get here (the menu hides it). */
export function ExportSheet({ chat, onClose, store }: Props) {
  const { t } = useTranslation();
  const run = async (format: ExportFormat) => {
    if (!chat || chat.incognito) return;
    const messages = await store.listMessages(chat.id);
    const file = exportChat(chat, messages, format, { modelNames: modelNames(), reasoning: false });
    onClose();
    afterSheetClose(() => void shareFile(file, t("export.dialog", { title: chat.title || t("newChat.title") })));
  };
  return (
    <Sheet visible={chat !== null} onClose={onClose} title={t("export.title")} testID="export-sheet" scroll={false}>
      {FORMATS.map((f) => (
        <SheetItem key={f} testID={`export-${f}`} label={t(`export.${f}`)} hint={t(`export.${f}Hint`)} onPress={() => void run(f)} />
      ))}
    </Sheet>
  );
}
