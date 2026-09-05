import { useEffect, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { getLocales } from "expo-localization";
import { initI18n } from "@inborn/i18n";
import { prepareEngine } from "./src/adapters";
import { Chat } from "./src/screens/Chat";

export default function App() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const tags = getLocales().map((l) => l.languageTag);
    Promise.all([initI18n(tags[0] ?? "en", tags), prepareEngine()]).then(() => setReady(true));
  }, []);
  if (!ready) return null;
  return (
    <SafeAreaProvider>
      <Chat />
      <StatusBar style="auto" />
    </SafeAreaProvider>
  );
}
