import { Redirect, useRouter } from "expo-router";
import { useAppServices } from "../services/AppServices";
import { Chat } from "../screens/Chat";

export default function Index() {
  const s = useAppServices();
  const router = useRouter();
  if (!s.prefs.onboarded) return <Redirect href="/onboarding" />;
  return <Chat key={s.active.key} store={s.store} chatId={s.active.id} incognito={s.active.incognito} onOpenChats={() => router.push("/chats")} onChatCreated={s.chatCreated} />;
}
