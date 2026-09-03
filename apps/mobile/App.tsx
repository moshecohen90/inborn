import { useEffect, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { getLocales } from "expo-localization";
import { initI18n } from "@autark/i18n";
import { Chat } from "./src/screens/Chat";

export default function App() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const tags = getLocales().map((l) => l.languageTag);
    initI18n(tags[0] ?? "en", tags).then(() => setReady(true));
  }, []);
  if (!ready) return null;
  return (
    <>
      <Chat />
      <StatusBar style="auto" />
    </>
  );
}
