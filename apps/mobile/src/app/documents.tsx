import { useRouter } from "expo-router";
import { DocumentsScreen } from "../screens/documents";

/** S40: the document library (spec §8.5); asking opens the in-library sheet, chats attach through useDocumentContext. */
export default function DocumentsRoute() {
  const router = useRouter();
  return <DocumentsScreen onClose={() => (router.canGoBack() ? router.back() : router.replace("/"))} onUnlock={() => router.push("/paywall")} />;
}
