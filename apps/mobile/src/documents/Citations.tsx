import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../services/theme";
import { useTranslation } from "react-i18next";
import { radius, type Theme } from "@inborn/ui";
import { GlassFill, panelColor, panelStyle } from "../components/shell/NativeChrome";
import { citationLabel, type Citation, type PageWords } from "@inborn/core";
import { getLibrary } from "./library";
import { font } from "../services/type";
import { useOpenSheet } from "../lib/openSheets";
import { hasPanel } from "../lib/layout";
import { useLayoutMode } from "../lib/useLayout";
import { openSidePanel } from "../lib/sidePanel";

export interface CitationsProps {
  citations: Citation[];
  /** False when the answer carried no [n] marks: the chips are the passages the model saw, labelled "sources". */
  cited?: boolean;
  /** Override the default passage sheet (the desktop side panel, for instance). */
  onOpen?: (c: Citation) => void;
}

/** "contract.pdf · p.4" chips under an answer (spec S12); tapping opens the passage. */
/** "p." / "sheet" / "part": the number after it is a real page only for PDFs and scans (QA F8). */
export function usePageWords(): PageWords {
  const { t } = useTranslation();
  return { page: t("documents.cite.page"), sheet: t("documents.cite.sheet"), part: t("documents.cite.part") };
}

export function Citations({ citations, cited = true, onOpen }: CitationsProps) {
  const { t } = useTranslation();
  const words = usePageWords();
  const { theme } = useTheme();
  const mode = useLayoutMode();
  const [open, setOpen] = useState<Citation | null>(null);
  /* On a desktop window the passage belongs in the right-hand panel (§8.9), not in a sheet over the answer. */
  const show = onOpen ?? (hasPanel(mode) ? (c: Citation) => openSidePanel({ kind: "citation", citation: c }) : setOpen);
  if (!citations.length) return null;
  return (
    <View testID="citations" style={styles.wrap}>
      {!cited ? <Text style={[styles.label, { color: theme.text3 }]}>{t("documents.sources")}</Text> : null}
      <View style={styles.row}>
        {citations.map((c) => (
          <Pressable
            key={`${c.n}-${c.chunkId}`}
            testID={`citation-${c.n}`}
            accessibilityRole="button"
            accessibilityLabel={t("documents.openPassage", { label: citationLabel(c, words) })}
            onPress={() => show(c)}
            style={[styles.chip, { backgroundColor: theme.surface2, borderColor: theme.border }]}
          >
            <Text style={[styles.chipText, { color: theme.text2 }]}>
              {cited ? `[${c.n}] ` : ""}
              {citationLabel(c, words)}
            </Text>
          </Pressable>
        ))}
      </View>
      {open ? <PassageSheet citation={open} theme={theme} onClose={() => setOpen(null)} /> : null}
    </View>
  );
}

/** The stored passage behind a citation; the snippet the answer carried is what shows until the full chunk is read. */
function usePassageText(citation: Citation): string {
  const [text, setText] = useState<string>(citation.snippet);
  useEffect(() => {
    let alive = true;
    getLibrary()
      .passage(citation.chunkId)
      .then((p) => {
        if (alive && p) setText(p.text);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [citation.chunkId]);
  return text;
}

/** The same passage as a column, for the desktop shell's right-hand panel (§8.9). */
export function PassagePanel({ citation }: { citation: Citation }) {
  const words = usePageWords();
  const { theme } = useTheme();
  const text = usePassageText(citation);
  return (
    <View testID="passage-panel" style={styles.panel}>
      <Text style={[styles.label, { color: theme.text3 }]}>{citationLabel(citation, words)}</Text>
      <ScrollView>
        <Text style={[styles.body, { color: theme.text }]}>{text}</Text>
      </ScrollView>
    </View>
  );
}

export function PassageSheet({ citation, theme, onClose }: { citation: Citation; theme: Theme; onClose: () => void }) {
  const { t } = useTranslation();
  const words = usePageWords();
  const text = usePassageText(citation);
  useOpenSheet(true, onClose);
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable testID="passage-sheet" style={[styles.sheet, panelStyle, { backgroundColor: panelColor(theme.surface1), borderColor: theme.border }]} onPress={() => undefined}>
          <GlassFill />
          <Text style={[styles.label, { color: theme.text3 }]}>{citationLabel(citation, words)}</Text>
          <ScrollView style={styles.scroll}>
            <Text style={[styles.body, { color: theme.text }]}>{text}</Text>
          </ScrollView>
          <Pressable accessibilityRole="button" onPress={onClose} style={[styles.close, { backgroundColor: theme.ctaFill }]}>
            <Text style={[styles.closeText, { color: theme.ctaText }]}>{t("documents.closePassage")}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6, marginTop: 6 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { height: 28, paddingHorizontal: 10, borderRadius: radius.chip, borderWidth: 1, justifyContent: "center" },
  chipText: { ...font("mono"), fontSize: 11, letterSpacing: 0.3 },
  label: { ...font("mono", "500"), fontSize: 11, letterSpacing: 0.9, textTransform: "uppercase" },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  sheet: { maxHeight: "70%", borderTopLeftRadius: radius.card, borderTopRightRadius: radius.card, borderWidth: 1, padding: 20, gap: 12 },
  scroll: { flexGrow: 0 },
  panel: { flex: 1, gap: 8, paddingHorizontal: 16, paddingBottom: 16 },
  body: { ...font("sans"), fontSize: 16, lineHeight: 25 },
  close: { height: 44, borderRadius: radius.control, alignItems: "center", justifyContent: "center" },
  closeText: { ...font("sans", "600"), fontSize: 16 },
});
