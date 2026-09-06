import { router, useLocalSearchParams } from "expo-router";
import { HandsFreeScreen } from "../screens/voice/HandsFreeScreen";

/** S44 voice mode (Pro). `?chat=<id>` continues that chat; `incognito=1` keeps the turns in RAM only. */
export default function VoiceRoute() {
  const params = useLocalSearchParams<{ chat?: string; incognito?: string }>();
  return <HandsFreeScreen chatId={params.chat ?? null} incognito={params.incognito === "1"} onClose={() => (router.canGoBack() ? router.back() : router.replace("/"))} onOpenVault={() => router.replace("/vault")} />;
}
