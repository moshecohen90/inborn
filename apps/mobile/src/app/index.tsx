import { Redirect, useRouter } from "expo-router";
import { useAppServices } from "../services/AppServices";
import { Chat } from "../screens/Chat";

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
      sealState={s.sealState}
      sealProgress={s.delivery?.status === "delivering" ? s.delivery.progress : undefined}
      onOpenChats={() => router.push("/chats")}
      onChatCreated={s.chatCreated}
      onNewChat={s.newChat}
      onOpenDocuments={() => router.push("/documents")}
      onOpenPaywall={() => router.push("/paywall")}
      onOpenVault={() => router.push("/vault")}
      onOpenVoice={(chatId, incognito) => router.push({ pathname: "/voice", params: { ...(chatId ? { chat: chatId } : {}), ...(incognito ? { incognito: "1" } : {}) } })}
    />
  );
}
