import { Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import type { DocumentRecord } from "@inborn/core";
import { useTheme } from "../../lib/theme";
import { Sheet, SheetItem } from "./Sheet";
import { shape, type } from "./styles";

interface Props {
  visible: boolean;
  onClose: () => void;
  /** The whole library (S40); attached ids are ticked. */
  documents: DocumentRecord[];
  attachedIds: string[];
  strict: boolean;
  onSetStrict: (v: boolean) => void;
  onAttach: (docId: string) => void;
  onDetach: (docId: string) => void;
  onManage: () => void;
}

/** The [+] sheet (§7.3, S12): pick documents for this chat, the strict switch, and the way to the library. */
export function AttachSheet({ visible, onClose, documents, attachedIds, strict, onSetStrict, onAttach, onDetach, onManage }: Props) {
  const theme = useTheme();
  const { t } = useTranslation();
  const indexed = (d: DocumentRecord) => d.chunkCount > 0;
  return (
    <Sheet visible={visible} onClose={onClose} title={t("chat.attach.title")} testID="attach-sheet">
      {documents.length ? (
        documents.map((d) => {
          const on = attachedIds.includes(d.id);
          const ready = indexed(d);
          return (
            <SheetItem
              key={d.id}
              testID={`attach-${d.id}`}
              label={d.name}
              hint={ready ? t("documents.state.indexed", { count: d.chunkCount }) : t("chat.attach.notIndexed")}
              disabled={!ready && !on}
              onPress={() => (on ? onDetach(d.id) : onAttach(d.id))}
              trailing={
                <View testID={on ? `attached-${d.id}` : undefined} style={[styles.tick, { borderColor: on ? theme.accent : theme.border, backgroundColor: on ? theme.accent : "transparent" }]}>
                  {on ? <Text style={[styles.tickGlyph, { color: theme.bg }]}>✓</Text> : null}
                </View>
              }
            />
          );
        })
      ) : (
        <Text style={[type.bodySmall, styles.empty, { color: theme.text3 }]}>{t("chat.attach.empty")}</Text>
      )}
      <View style={[styles.strictRow, { borderColor: theme.border }]}>
        <View style={styles.grow}>
          <Text style={[type.body, { color: theme.text }]}>{t("documents.strict.title")}</Text>
          <Text style={[type.caption, { color: theme.text3 }]}>{t("documents.strict.hint")}</Text>
        </View>
        <Switch testID="attach-strict" value={strict} onValueChange={onSetStrict} trackColor={{ true: theme.text2, false: theme.border }} />
      </View>
      <Pressable testID="attach-manage" accessibilityRole="button" onPress={onManage} style={[shape.control, styles.manage, { borderColor: theme.border }]}>
        <Text style={[type.body, { color: theme.text }]}>{t("chat.attach.manage")}</Text>
      </Pressable>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  tick: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  tickGlyph: { fontSize: 12, fontWeight: "700" },
  empty: { paddingHorizontal: 12, paddingVertical: 12 },
  strictRow: { flexDirection: "row", alignItems: "center", gap: 12, marginHorizontal: 12, marginTop: 8, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  grow: { flex: 1, gap: 2 },
  manage: { marginHorizontal: 12, marginTop: 12, borderWidth: 1, alignItems: "center" },
});
