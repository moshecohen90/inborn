import { Redirect, useRouter } from "expo-router";
import { useAppServices } from "../services/AppServices";
import { Chat } from "../screens/Chat";
import { resetEngine } from "../engine";
import { getVault } from "../vault/store";

export default function Index() {
  const s = useAppServices();
  const router = useRouter();
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
      onOpenChats={() => router.push("/chats")}
      onChatCreated={s.chatCreated}
      onNewChat={s.newChat}
      onOpenDocuments={() => router.push("/documents")}
      onOpenPaywall={() => router.push("/paywall")}
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
