import { useTranslation } from "react-i18next";
import { exportChat, paywallFor, type Chat, type ChatStore, type ExportFormat } from "@inborn/core";
import { shareFile } from "../../lib/share";
import { modelNames } from "../../lib/models";
import { useEntitlement } from "../../licence";
import { ProTag, Sheet, SheetItem } from "../../components/chat/Sheet";
import { afterSheetClose } from "../Chat";

interface Props {
  chat: Chat | null;
  onClose: () => void;
  store: ChatStore;
  /** "Export all" is a §12.3 value moment: Free lands on the paywall. */
  onUnlock?: () => void;
}

const FORMATS: ExportFormat[] = ["markdown", "text", "json"];

/** Single-chat export through the system share sheet (§7.1), plus every saved chat at once (Pro). Incognito chats never get here (the menu hides it). */
export function ExportSheet({ chat, onClose, store, onUnlock }: Props) {
  const { t } = useTranslation();
  const { tier } = useEntitlement();
  const allLocked = paywallFor(tier, { kind: "feature", feature: "exportAll" });
  const run = async (format: ExportFormat) => {
    if (!chat || chat.incognito) return;
    const messages = await store.listMessages(chat.id);
    const file = exportChat(chat, messages, format, { modelNames: modelNames(), reasoning: false });
    onClose();
    afterSheetClose(() => void shareFile(file, t("export.dialog", { title: chat.title || t("newChat.title") })));
  };
  const runAll = async () => {
    if (allLocked) {
      onClose();
      afterSheetClose(() => onUnlock?.());
      return;
    }
    const chats = (await store.listChats()).filter((c) => !c.incognito);
    const parts: string[] = [];
    for (const c of chats) parts.push(exportChat(c, await store.listMessages(c.id), "markdown", { modelNames: modelNames(), reasoning: false }).body);
    onClose();
    afterSheetClose(() => void shareFile({ filename: "inborn-chats.md", mimeType: "text/markdown", body: parts.join("\n\n---\n\n") }, t("export.allDialog")));
  };
  return (
    <Sheet visible={chat !== null} onClose={onClose} title={t("export.title")} testID="export-sheet" scroll={false}>
      {FORMATS.map((f) => (
        <SheetItem key={f} testID={`export-${f}`} label={t(`export.${f}`)} hint={t(`export.${f}Hint`)} onPress={() => void run(f)} />
      ))}
      <SheetItem testID="export-all" label={t("export.all")} hint={t("export.allHint")} onPress={() => void runAll()} trailing={allLocked ? <ProTag onPress={() => void runAll()} /> : undefined} />
    </Sheet>
  );
}
