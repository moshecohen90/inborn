import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { AppModal } from "../../components/shell/AppModal";
import { useTranslation } from "react-i18next";
import { radius, type Theme } from "@inborn/ui";
import { GlassFill, panelColor, panelStyle } from "../../components/shell/NativeChrome";
import { formatBytes, type DocumentRecord } from "@inborn/core";
import { kindLabel } from "./DocumentRow";
import { font } from "../../services/type";
import { useOpenSheet } from "../../lib/openSheets";

export interface DocumentDetailsProps {
  doc: DocumentRecord;
  theme: Theme;
  ocrEngine: string;
  onClose: () => void;
  onAsk: () => void;
  onDelete: () => void;
}

/** S40 document details: chunks, detected language, embedding model, OCR pages, flagged lines, delete, "Ask this document". */
export function DocumentDetails({ doc, theme, ocrEngine, onClose, onAsk, onDelete }: DocumentDetailsProps) {
  const { t } = useTranslation();
  const rows: Array<[string, string]> = [
    [t("documents.details.type"), kindLabel(doc.kind)],
    [t("documents.details.pages"), doc.pages ? String(doc.pages) : "—"],
    [t("documents.details.size"), formatBytes(doc.bytes)],
    [t("documents.details.chunks"), String(doc.chunkCount)],
    [t("documents.details.language"), doc.language ? t(`documents.language.${doc.language}`, { defaultValue: doc.language }) : "—"],
    [t("documents.details.embedModel"), doc.embedModel ?? "—"],
    [t("documents.details.ocrPages"), doc.ocrPages ? `${doc.ocrPages} · ${ocrEngine}` : "0"],
    [t("documents.details.flagged"), String(doc.flaggedLines)],
    [t("documents.details.added"), new Date(doc.addedAt).toLocaleString()],
  ];
  useOpenSheet(true, onClose);
  return (
    <AppModal transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable testID="doc-details" style={[styles.sheet, panelStyle, { backgroundColor: panelColor(theme.surface1), borderColor: theme.border }]} onPress={() => undefined}>
          <GlassFill />
          <Text style={[styles.label, { color: theme.text3 }]}>{t("documents.details.title")}</Text>
          <Text style={[styles.name, { color: theme.text }]}>{doc.name}</Text>
          <ScrollView style={styles.scroll}>
            {rows.map(([k, v]) => (
              <View key={k} style={[styles.row, { borderColor: theme.border }]}>
                <Text style={[styles.mono, { color: theme.text3 }]}>{k}</Text>
                <Text style={[styles.value, { color: theme.text }]}>{v}</Text>
              </View>
            ))}
            {doc.flaggedLines > 0 ? <Text style={[styles.note, { color: theme.accent }]}>{t("documents.details.flaggedNote", { count: doc.flaggedLines })}</Text> : null}
            {doc.error ? <Text style={[styles.note, { color: theme.danger }]}>{t(`documents.error.${doc.error}`, { defaultValue: doc.error })}</Text> : null}
          </ScrollView>
          <View style={styles.buttons}>
            {doc.chunkCount > 0 ? (
              <Pressable testID="doc-ask" accessibilityRole="button" onPress={onAsk} style={[styles.btn, { backgroundColor: theme.ctaFill }]}>
                <Text style={[styles.btnText, { color: theme.ctaText }]}>{t("documents.askThis")}</Text>
              </Pressable>
            ) : null}
            <Pressable testID="doc-delete" accessibilityRole="button" onPress={onDelete} style={[styles.btn, { borderWidth: 1, borderColor: theme.danger }]}>
              <Text style={[styles.btnText, { color: theme.danger }]}>{t("documents.delete")}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={onClose} style={[styles.btn, { borderWidth: 1, borderColor: theme.border }]}>
              <Text style={[styles.btnText, { color: theme.text2 }]}>{t("documents.close")}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  sheet: { maxHeight: "85%", borderTopLeftRadius: radius.card, borderTopRightRadius: radius.card, borderWidth: 1, padding: 20, gap: 10 },
  label: { ...font("mono", "500"), fontSize: 11, letterSpacing: 0.9, textTransform: "uppercase" },
  name: { ...font("sans", "600"), fontSize: 20 },
  scroll: { flexGrow: 0 },
  row: { flexDirection: "row", justifyContent: "space-between", gap: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  mono: { ...font("mono"), fontSize: 11, letterSpacing: 0.5, textTransform: "uppercase" },
  value: { ...font("sans"), fontSize: 14, flexShrink: 1, textAlign: "right" },
  note: { ...font("sans"), fontSize: 13, paddingTop: 10, lineHeight: 19 },
  buttons: { gap: 8, paddingTop: 6 },
  btn: { height: 44, borderRadius: radius.control, alignItems: "center", justifyContent: "center" },
  btnText: { ...font("sans", "600"), fontSize: 16 },
});
