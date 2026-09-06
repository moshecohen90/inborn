import { useLocalSearchParams } from "expo-router";
import { Legal, isLegalDoc } from "../../screens/Legal/Legal";
import NotFound from "../+not-found";

/** `/legal/privacy` and `/legal/terms`: the store texts from docs/legal, bundled, never fetched. */
export default function LegalRoute() {
  const { doc } = useLocalSearchParams<{ doc: string }>();
  if (!isLegalDoc(doc)) return <NotFound />;
  return <Legal doc={doc} />;
}
