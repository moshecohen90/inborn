import { useEffect, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { getLocales } from "expo-localization";
import { initI18n } from "@inborn/i18n";
import { ChatStore, InMemoryChatRepository, type ChatRepository } from "@inborn/core";
import { prepareEngine } from "./src/adapters";
import { Chat } from "./src/screens/Chat";
import { Chats } from "./src/screens/Chats";
import { openPersistentStorage } from "./src/storage/persistent";

type Screen = "chat" | "chats";
/** `key` remounts the chat screen whenever a different conversation is opened. */
type Active = { id: string | null; incognito: boolean; key: number };

export default function App() {
  const [store, setStore] = useState<ChatStore | null>(null);
  const [screen, setScreen] = useState<Screen>("chat");
  const [active, setActive] = useState<Active>({ id: null, incognito: false, key: 0 });

  useEffect(() => {
    const tags = getLocales().map((l) => l.languageTag);
    (async () => {
      await Promise.all([initI18n(tags[0] ?? "en", tags), prepareEngine()]);
      let repository: ChatRepository;
      try {
        repository = (await openPersistentStorage()).repository;
      } catch (e: unknown) {
        console.warn("Encrypted storage unavailable; chats stay in memory for this run.", e);
        repository = new InMemoryChatRepository();
      }
      setStore(new ChatStore(repository));
    })().catch((e: unknown) => console.error("boot failed", e));
  }, []);

  if (!store) return null;
  // An incognito chat is gone the moment the user leaves it (spec §5.7), not just when the app exits.
  const closeActive = () => {
    if (active.incognito && active.id) store.deleteChat(active.id).catch((e: unknown) => console.warn("deleteChat", e));
  };
  return (
    <SafeAreaProvider>
      {screen === "chats" ? (
        <Chats
          store={store}
          activeChatId={active.id}
          onClose={() => setScreen("chat")}
          onOpenChat={(chat) => {
            if (chat.id !== active.id) closeActive();
            setActive((a) => ({ id: chat.id, incognito: chat.incognito, key: a.key + 1 }));
            setScreen("chat");
          }}
          onNewChat={(incognito) => {
            closeActive();
            setActive((a) => ({ id: null, incognito, key: a.key + 1 }));
            setScreen("chat");
          }}
          onDeleted={(id) => setActive((a) => (a.id === id ? { id: null, incognito: false, key: a.key + 1 } : a))}
        />
      ) : (
        <Chat
          key={active.key}
          store={store}
          chatId={active.id}
          incognito={active.incognito}
          onOpenChats={() => setScreen("chats")}
          onChatCreated={(id) => setActive((a) => ({ ...a, id }))}
        />
      )}
      <StatusBar style="auto" />
    </SafeAreaProvider>
  );
}
