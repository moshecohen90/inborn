import { useRouter } from "expo-router";
import { VaultEntry } from "../screens/vault/VaultEntry";
import { useAppServices } from "../services/AppServices";

/** S30: the vault; a new default model starts a fresh chat so the remounted screen loads it. The web gets the door (§8.9). */
export default function VaultRoute() {
  const router = useRouter();
  const s = useAppServices();
  return (
    <VaultEntry
      onClose={() => (router.canGoBack() ? router.back() : router.replace("/"))}
      onModelChanged={() => {
        s.modelChanged();
        s.newChat(false);
        router.replace("/");
      }}
      onUnlock={() => router.push("/paywall")}
    />
  );
}
