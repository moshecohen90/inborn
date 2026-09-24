import { useLocalSearchParams, useRouter } from "expo-router";
import { VaultEntry } from "../screens/vault/VaultEntry";
import { useAppServices } from "../services/AppServices";
import { openPaywall } from "../licence";

/** S30: the vault; a new default model starts a fresh chat so the remounted screen loads it. The web gets the door (§8.9). */
/* dismissTo pops back to the chat already in the stack: a replace() here left the old chat mounted under a second one, so two screens awaited the load and consumed the dev prompt. */
export default function VaultRoute() {
  const router = useRouter();
  const s = useAppServices();
  const { focus } = useLocalSearchParams<{ focus?: string }>();
  return (
    <VaultEntry
      focus={typeof focus === "string" ? focus : undefined}
      onClose={() => (router.canGoBack() ? router.back() : router.replace("/"))}
      onModelChanged={() => {
        s.modelChanged();
        s.newChat(false);
        router.dismissTo("/");
      }}
      onUnlock={openPaywall}
    />
  );
}
