import { Redirect, router, useLocalSearchParams } from "expo-router";
import { paywallFor } from "@inborn/core";
import { useEntitlement } from "../licence";
import { HandsFreeScreen } from "../screens/voice/HandsFreeScreen";

/** S44 voice mode (Pro). `?chat=<id>` continues that chat; `incognito=1` keeps the turns in RAM only. */
export default function VoiceRoute() {
  const params = useLocalSearchParams<{ chat?: string; incognito?: string }>();
  const { tier, loading } = useEntitlement();
  /* F53: the chat's mic gated this, the URL did not — a deep link, a desktop menu item or a restored route reached it for free. */
  if (loading) return null;
  if (paywallFor(tier, { kind: "feature", feature: "voiceConversation" })) return <Redirect href="/paywall?reason=voiceConversation" />;
  return <HandsFreeScreen chatId={params.chat ?? null} incognito={params.incognito === "1"} onClose={() => (router.canGoBack() ? router.back() : router.replace("/"))} onOpenVault={() => router.replace("/vault")} />;
}
