import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View, useColorScheme } from "react-native";
import { useTranslation } from "react-i18next";
import { dark, light, radius, type Theme } from "@inborn/ui";
import { GlassFill, panelColor, panelStyle } from "../components/shell/NativeChrome";
import { citationLabel, type Citation } from "@inborn/core";
import { getLibrary } from "./library";
import { font } from "../services/type";
import { useOpenSheet } from "../lib/openSheets";

export interface CitationsProps {
  citations: Citation[];
  /** False when the answer carried no [n] marks: the chips are the passages the model saw, labelled "sources". */
  cited?: boolean;
  /** Override the default passage sheet (the desktop side panel, for instance). */
  onOpen?: (c: Citation) => void;
}

/** "contract.pdf · p.4" chips under an answer (spec S12); tapping opens the passage. */
export function Citations({ citations, cited = true, onOpen }: CitationsProps) {
  const { t } = useTranslation();
  const theme = useColorScheme() === "light" ? light : dark;
  const [open, setOpen] = useState<Citation | null>(null);
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
            accessibilityLabel={t("documents.openPassage", { label: citationLabel(c) })}
            onPress={() => (onOpen ? onOpen(c) : setOpen(c))}
            style={[styles.chip, { backgroundColor: theme.surface2, borderColor: theme.border }]}
          >
            <Text style={[styles.chipText, { color: theme.text2 }]}>
              {cited ? `[${c.n}] ` : ""}
              {citationLabel(c)}
            </Text>
          </Pressable>
        ))}
      </View>
      {open ? <PassageSheet citation={open} theme={theme} onClose={() => setOpen(null)} /> : null}
    </View>
  );
}

export function PassageSheet({ citation, theme, onClose }: { citation: Citation; theme: Theme; onClose: () => void }) {
  const { t } = useTranslation();
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
  useOpenSheet(true, onClose);
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable testID="passage-sheet" style={[styles.sheet, panelStyle, { backgroundColor: panelColor(theme.surface1), borderColor: theme.border }]} onPress={() => undefined}>
          <GlassFill />
          <Text style={[styles.label, { color: theme.text3 }]}>{citationLabel(citation)}</Text>
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
  body: { ...font("sans"), fontSize: 16, lineHeight: 25 },
  close: { height: 44, borderRadius: radius.control, alignItems: "center", justifyContent: "center" },
  closeText: { ...font("sans", "600"), fontSize: 16 },
});
