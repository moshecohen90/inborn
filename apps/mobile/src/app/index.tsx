import { Redirect, useRouter } from "expo-router";
import { useAppServices } from "../services/AppServices";
import { hasPanel, isWide } from "../lib/layout";
import { useLayoutMode } from "../lib/useLayout";
import { emitShortcut } from "../lib/shortcuts";
import { openSidePanel } from "../lib/sidePanel";
import { Chat } from "../screens/Chat";
import { resetEngine } from "../engine";
import { getVault } from "../vault/store";
import { openPaywall } from "../licence";

export default function Index() {
  const s = useAppServices();
  const router = useRouter();
  const mode = useLayoutMode();
  if (!s.prefs.onboarded) return <Redirect href="/onboarding" />;
  return (
    <Chat
      key={s.active.key}
      store={s.store}
      chatId={s.active.id}
      incognito={s.active.incognito}
      personaId={s.active.personaId}
      seed={s.active.seed}
      onSeedConsumed={s.seedConsumed}
      sealState={s.sealState}
      sealProgress={s.delivery && (s.delivery.status === "delivering" || s.delivery.status === "verifying") ? s.delivery.progress : undefined}
      /* §8.9: the wide shell keeps the chats in the sidebar, so the chats door is the command palette instead. */
      onOpenChats={() => (isWide(mode) ? emitShortcut("palette") : router.push("/chats"))}
      onChatCreated={s.chatCreated}
      onNewChat={s.newChat}
      onOpenDocuments={() => (hasPanel(mode) ? openSidePanel({ kind: "documents" }) : router.push("/documents"))}
      onOpenPaywall={openPaywall}
      onOpenVault={() => router.push("/vault")}
      onSwitchModel={(id) => {
        getVault().setDefault(id);
        void resetEngine().then(() => {
          s.modelChanged();
          s.reloadChat();
        });
      }}
      onOpenVoice={(chatId, incognito) => router.push({ pathname: "/voice", params: { ...(chatId ? { chat: chatId } : {}), ...(incognito ? { incognito: "1" } : {}) } })}
    />
  );
}
