import { StyleSheet } from "react-native";
import { fonts, radius } from "@inborn/ui";

/** Type scale from spec §9.3; mono only for labels and numbers. */
export const type = StyleSheet.create({
  display: { fontFamily: fonts.sans, fontSize: 32, lineHeight: 38, fontWeight: "600", letterSpacing: -0.6 },
  title: { fontFamily: fonts.sans, fontSize: 22, lineHeight: 28, fontWeight: "600", letterSpacing: -0.2 },
  heading: { fontFamily: fonts.sans, fontSize: 17, lineHeight: 24, fontWeight: "600" },
  body: { fontFamily: fonts.sans, fontSize: 16, lineHeight: 25 },
  bodySmall: { fontFamily: fonts.sans, fontSize: 14, lineHeight: 20 },
  caption: { fontFamily: fonts.sans, fontSize: 12, lineHeight: 16, fontWeight: "500" },
  mono: { fontFamily: fonts.mono, fontSize: 12, lineHeight: 16 },
  monoLabel: { fontFamily: fonts.mono, fontSize: 11, lineHeight: 14, fontWeight: "500", letterSpacing: 0.9, textTransform: "uppercase" },
  strong: { fontWeight: "600" },
});

export const shape = StyleSheet.create({
  chip: { minHeight: 28, paddingHorizontal: 10, borderRadius: radius.chip, borderWidth: 1, justifyContent: "center", alignItems: "center" },
  control: { minHeight: 44, paddingHorizontal: 16, borderRadius: radius.control, alignItems: "center", justifyContent: "center" },
  field: { minHeight: 44, borderWidth: 1, borderRadius: radius.control, paddingHorizontal: 12, paddingVertical: 10, fontFamily: fonts.sans, fontSize: 16 },
  card: { borderWidth: 1, borderRadius: radius.card, padding: 16 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  hairline: { height: StyleSheet.hairlineWidth },
  fill: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
});
