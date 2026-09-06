import { useRouter } from "expo-router";
import { VaultScreen } from "../screens/vault/VaultScreen";
import { useAppServices } from "../services/AppServices";

/** S30: the vault; a new default model starts a fresh chat so the remounted screen loads it. */
export default function VaultRoute() {
  const router = useRouter();
  const s = useAppServices();
  return (
    <VaultScreen
      onClose={() => router.back()}
      onModelChanged={() => {
        s.modelChanged();
        s.newChat(false);
        router.replace("/");
      }}
      onUnlock={() => router.push("/paywall")}
    />
  );
}
