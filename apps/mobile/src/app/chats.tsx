import { Redirect, useRouter } from "expo-router";
import { ChatsPane } from "../components/shell/ChatsPane";
import { useWide } from "../lib/useLayout";

/** S20: the chats drawer. On a wide window the same pane is already in the sidebar, so the route has nothing to add (§8.9). */
export default function ChatsRoute() {
  const router = useRouter();
  const wide = useWide();
  if (wide) return <Redirect href="/" />;
  return <ChatsPane onClose={() => (router.canGoBack() ? router.back() : router.replace("/"))} />;
}
