import { StyleSheet } from "react-native";
import { radius } from "@inborn/ui";
import { font } from "../../services/type";

/** Chat shapes; every text style comes from useType() (§9.3) so the text-size setting reaches the chat too. */
export const shape = StyleSheet.create({
  chip: { minHeight: 28, paddingHorizontal: 10, borderRadius: radius.chip, borderWidth: 1, justifyContent: "center", alignItems: "center" },
  control: { minHeight: 44, paddingHorizontal: 16, borderRadius: radius.control, alignItems: "center", justifyContent: "center" },
  field: { minHeight: 44, borderWidth: 1, borderRadius: radius.control, paddingHorizontal: 12, paddingVertical: 10, ...font("sans"), fontSize: 16 },
  card: { borderWidth: 1, borderRadius: radius.card, padding: 16 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  hairline: { height: StyleSheet.hairlineWidth },
  fill: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
});
