import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import type { ChatMessage, ReportInput, ReportReason } from "@inborn/core";
import { useTheme } from "../../lib/theme";
import { Sheet } from "./Sheet";
import { shape } from "./styles";
import { useType } from "../../services/type";
import { Toggle } from "../shell/primitives";

const REASONS: ReportReason[] = ["offensive", "dangerous", "wrong", "other"];

interface Props {
  message: ChatMessage | null;
  onClose: () => void;
  onSave: (report: ReportInput) => Promise<void>;
  onEmail: (report: ReportInput) => Promise<void>;
}

/** Report an answer without leaving the app (§8.2 S13). Stored on the phone; nothing is sent unless the user shares it. */
export function ReportSheet({ message, onClose, onSave, onEmail }: Props) {
  const type = useType();
  const theme = useTheme();
  const { t } = useTranslation();
  const [reason, setReason] = useState<ReportReason>("wrong");
  const [note, setNote] = useState("");
  const [include, setInclude] = useState(true);
  const [saved, setSaved] = useState(false);
  const build = (): ReportInput => ({
    reason,
    note: note.trim(),
    ...(message ? { chatId: message.chatId, messageId: message.id, modelId: message.modelId } : {}),
    ...(include && message ? { messageText: message.content } : {}),
  });
  const save = async () => {
    await onSave(build());
    setSaved(true);
    setTimeout(onClose, 900);
  };
  return (
    <Sheet visible={message !== null} onClose={onClose} title={t("report.title")} testID="report-sheet">
      <View style={styles.body}>
        <View style={styles.reasons}>
          {REASONS.map((r) => (
            <Pressable key={r} testID={`report-reason-${r}`} accessibilityRole="radio" accessibilityState={{ selected: reason === r }} onPress={() => setReason(r)} style={[shape.chip, styles.chip, { borderColor: reason === r ? theme.accent : theme.border, backgroundColor: theme.surface2 }]}>
              <Text style={[type.bodySmall, { color: reason === r ? theme.accent : theme.text }]}>{t(`report.reason.${r}`)}</Text>
            </Pressable>
          ))}
        </View>
        <TextInput testID="report-note" value={note} onChangeText={setNote} placeholder={t("report.notePlaceholder")} placeholderTextColor={theme.text3} multiline style={[shape.field, styles.note, { backgroundColor: theme.well, borderColor: theme.border, color: theme.text }]} />
        <View style={styles.switchRow}>
          <Text style={[type.body, styles.grow, { color: theme.text }]}>{t("report.includeMessage")}</Text>
          <Toggle testID="report-include" value={include} onChange={setInclude} />
        </View>
        <Text style={[type.caption, { color: theme.text3 }]}>{t("report.explain")}</Text>
        <View style={styles.actions}>
          <Pressable testID="report-email" accessibilityRole="button" onPress={() => void onEmail(build())} style={[shape.control, { borderWidth: 1, borderColor: theme.border }]}>
            <Text style={[type.body, { color: theme.text }]}>{t("report.email")}</Text>
          </Pressable>
          <Pressable testID="report-save" accessibilityRole="button" onPress={() => void save()} style={[shape.control, { backgroundColor: theme.ctaFill }]}>
            <Text style={[type.body, type.strong, { color: theme.ctaText }]}>{saved ? t("report.saved") : t("report.save")}</Text>
          </Pressable>
        </View>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 12, gap: 14, paddingBottom: 8 },
  reasons: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { minHeight: 36, paddingHorizontal: 14 },
  note: { minHeight: 88, textAlignVertical: "top" },
  switchRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  grow: { flex: 1 },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" },
});
