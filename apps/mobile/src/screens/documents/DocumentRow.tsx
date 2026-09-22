import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Icon, radius, type Theme } from "@inborn/ui";
import { formatBytes, pageUnit, type DocumentRecord, type IndexProgress } from "@inborn/core";
import { font } from "../../services/type";
import { deviceNoun } from "../../lib/deviceNoun";

export interface DocumentRowProps {
  doc: DocumentRecord;
  progress?: IndexProgress;
  theme: Theme;
  selected: boolean;
  onPress: () => void;
  onToggleSelect: () => void;
  onCancel: () => void;
  onResume: () => void;
  onOcr: () => void;
  ocrAvailable: boolean;
  /** OCR is Pro (§7.3): the action stays visible and opens the paywall instead of running. */
  ocrLocked?: boolean;
}

export const kindLabel = (kind: DocumentRecord["kind"]): string => (kind === "unknown" ? "?" : kind.toUpperCase());

/** One library row (spec S40): type · pages · size, then the state line (Indexed / Indexing 43% / Needs OCR / Failed). */
export function DocumentRow({ doc, progress, theme, selected, onPress, onToggleSelect, onCancel, onResume, onOcr, ocrAvailable, ocrLocked }: DocumentRowProps) {
  const { t } = useTranslation();
  const pages = doc.pages ? t(`documents.${pageUnit(doc.kind)}s`, { count: doc.pages }) : null;
  const meta = [kindLabel(doc.kind), pages, formatBytes(doc.bytes)].filter(Boolean).join(" · ");
  const state = (): { text: string; color: string } => {
    switch (doc.status) {
      case "indexing": {
        const total = Math.max(1, progress?.pages ?? doc.pages);
        const page = progress?.page ?? doc.indexedPages;
        return { text: t("documents.state.indexing", { percent: Math.floor((100 * page) / total), page, pages: total }), color: theme.accent };
      }
      case "queued":
        return { text: t("documents.state.queued"), color: theme.text3 };
      case "indexed":
        return { text: t("documents.state.indexed", { count: doc.chunkCount }), color: theme.sealed };
      case "needs-ocr":
        return { text: t("documents.state.needsOcr", { device: deviceNoun() }), color: theme.accent };
      case "cancelled":
        return { text: t("documents.state.cancelled", { page: doc.indexedPages, pages: doc.pages }), color: theme.text2 };
      case "empty":
        return { text: t(doc.bytes === 0 ? "documents.error.empty" : "documents.state.empty"), color: theme.danger };
      case "failed":
        return { text: t(`documents.error.${doc.error ?? "corrupt"}`, { defaultValue: t("documents.state.failed", { error: doc.error ?? "" }) }), color: theme.danger };
    }
  };
  const s = state();
  const canSelect = doc.chunkCount > 0;
  return (
    <Pressable testID={`doc-row-${doc.id}`} onPress={onPress} style={[styles.row, { backgroundColor: theme.surface1, borderColor: selected ? theme.accent : theme.border }]}>
      <Pressable
        testID={`doc-select-${doc.id}`}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: selected, disabled: !canSelect }}
        onPress={canSelect ? onToggleSelect : undefined}
        style={[styles.check, { borderColor: canSelect ? theme.text2 : theme.border, backgroundColor: selected ? theme.accent : "transparent" }]}
      >
        {selected ? <Icon name="check" size={14} color={theme.bg} strokeWidth={3} /> : null}
      </Pressable>
      <View style={styles.body}>
        <Text numberOfLines={1} style={[styles.name, { color: theme.text }]}>
          {doc.name}
        </Text>
        <Text style={[styles.mono, { color: theme.text3 }]}>{meta}</Text>
        <Text testID={`doc-state-${doc.id}`} style={[styles.mono, { color: s.color }]}>
          {s.text}
        </Text>
        {doc.status === "indexing" ? (
          <View style={[styles.bar, { backgroundColor: theme.well }]}>
            <View style={[styles.fill, { backgroundColor: theme.accent, width: `${Math.min(100, Math.floor((100 * (progress?.page ?? doc.indexedPages)) / Math.max(1, progress?.pages ?? doc.pages)))}%` }]} />
          </View>
        ) : null}
      </View>
      <View style={styles.actions}>
        {doc.status === "indexing" || doc.status === "queued" ? <Action label={t("documents.cancel")} theme={theme} onPress={onCancel} testID={`doc-cancel-${doc.id}`} /> : null}
        {doc.status === "cancelled" || (doc.status === "failed" && doc.error !== "unsupported" && doc.error !== "corrupt" && doc.error !== "encrypted") ? <Action label={t("documents.resume")} theme={theme} onPress={onResume} testID={`doc-resume-${doc.id}`} /> : null}
        {doc.status === "needs-ocr" && ocrAvailable ? <Action label={t(ocrLocked ? "documents.runOcrPro" : "documents.runOcr")} theme={theme} onPress={onOcr} testID={`doc-ocr-${doc.id}`} /> : null}
      </View>
    </Pressable>
  );
}

function Action({ label, theme, onPress, testID }: { label: string; theme: Theme; onPress: () => void; testID: string }) {
  return (
    <Pressable testID={testID} accessibilityRole="button" onPress={onPress} style={[styles.action, { borderColor: theme.border, backgroundColor: theme.surface2 }]}>
      <Text style={[styles.actionText, { color: theme.text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: radius.card, borderWidth: 1 },
  check: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  body: { flex: 1, gap: 3 },
  name: { ...font("sans", "600"), fontSize: 16 },
  mono: { ...font("mono"), fontSize: 11, letterSpacing: 0.4 },
  bar: { height: 3, borderRadius: 2, marginTop: 4, overflow: "hidden" },
  fill: { height: 3 },
  actions: { gap: 6 },
  action: { height: 32, paddingHorizontal: 12, borderRadius: radius.control, borderWidth: 1, justifyContent: "center" },
  actionText: { ...font("sans", "500"), fontSize: 13 },
});
