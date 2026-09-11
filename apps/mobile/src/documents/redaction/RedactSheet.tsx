import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import { REDACT_KINDS, detect, directionOf, type RedactKind } from "@inborn/core";
import { Icon, radius } from "@inborn/ui";
import { Sheet } from "../../components/chat/Sheet";
import { shape } from "../../components/chat/styles";
import { Toggle } from "../../components/shell/primitives";
import { useTheme } from "../../lib/theme";
import { useType } from "../../services/type";
import { useRedaction, useRedactionPrefs } from "./hooks";

interface Props {
  visible: boolean;
  onClose: () => void;
  /** The composer's draft. */
  text: string;
  chatKey: string;
  /** Free / Pro: the sheet is the value moment (§12.3) with one price line. */
  locked: boolean;
  price: string;
  onUnlock?: () => void;
  onApply: (redacted: string) => void;
}

const PREVIEW_CHARS = 400;

/** The Redact sheet (§7.3 Work): what was found, per-kind switches, the names list, a preview, one Apply. */
export function RedactSheet({ visible, onClose, text, chatKey, locked, price, onUnlock, onApply }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const type = useType();
  const redaction = useRedaction(chatKey);
  const prefs = useRedactionPrefs();
  const [off, setOff] = useState<Set<RedactKind>>(new Set());
  const [newName, setNewName] = useState("");
  const kinds = useMemo(() => Object.fromEntries(REDACT_KINDS.map((k) => [k, k === "date" ? prefs.dates && !off.has(k) : !off.has(k)])) as Record<RedactKind, boolean>, [off, prefs.dates]);
  const found = useMemo(() => (locked ? [] : detect(text, { names: prefs.names, kinds })), [text, prefs.names, kinds, locked]);
  const counts = useMemo(() => {
    const c: Partial<Record<RedactKind, number>> = {};
    for (const d of detect(text, { names: prefs.names, kinds: { date: true } })) c[d.kind] = (c[d.kind] ?? 0) + 1;
    return c;
  }, [text, prefs.names]);
  const preview = useMemo(() => {
    let out = "";
    let at = 0;
    for (const d of found) {
      out += text.slice(at, d.start) + `[${d.kind.toUpperCase()}]`;
      at = d.end;
    }
    return (out + text.slice(at)).slice(0, PREVIEW_CHARS);
  }, [found, text]);
  const dir = directionOf(text);
  const toggleKind = (k: RedactKind, on: boolean) => {
    if (k === "date") prefs.setDates(on);
    setOff((s) => {
      const next = new Set(s);
      if (on) next.delete(k);
      else next.add(k);
      return next;
    });
  };
  const addName = () => {
    const n = newName.trim();
    if (n.length < 2) return;
    prefs.setNames([...prefs.names, n]);
    setNewName("");
  };
  const apply = () => {
    const r = redaction.redact(text, { kinds });
    onApply(r.text);
    onClose();
  };
  const present = REDACT_KINDS.filter((k) => (counts[k] ?? 0) > 0 || k === "date" || k === "name");
  return (
    <Sheet visible={visible} onClose={onClose} title={t("redact.title")} testID="redact-sheet">
      {locked ? (
        <View testID="redact-locked" style={[styles.card, { backgroundColor: theme.surface2, borderColor: theme.accent }]}>
          <Text style={[type.monoLabel, { color: theme.accent }]}>{t("redact.locked.eyebrow")}</Text>
          <Text style={[type.body, { color: theme.text }]}>{t("redact.locked.explain")}</Text>
          <Text style={[type.monoLabel, { color: theme.text2 }]}>{t("paywall.priceLine", { price })}</Text>
          {onUnlock ? (
            <Pressable testID="redact-unlock" accessibilityRole="button" onPress={onUnlock} style={[shape.control, styles.cta, { backgroundColor: theme.ctaFill }]}>
              <Text style={[type.body, type.strong, { color: theme.ctaText }]}>{t("gate.unlockWork")}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <>
          <Text style={[type.caption, styles.pad, { color: theme.text3 }]}>{t("redact.explain")}</Text>
          {present.map((k) => (
            <View key={k} style={[styles.row, { borderColor: theme.border }]}>
              <View style={styles.grow}>
                <Text style={[type.body, { color: theme.text }]}>{t(`redact.kind.${k}`)}</Text>
                <Text style={[type.caption, { color: theme.text3 }]}>{k === "name" && !prefs.names.length ? t("redact.names.hint") : t("redact.found", { count: counts[k] ?? 0 })}</Text>
              </View>
              <Toggle testID={`redact-kind-${k}`} label={t(`redact.kind.${k}`)} value={kinds[k]} onChange={(v) => toggleKind(k, v)} disabled={k !== "date" && !(counts[k] ?? 0)} />
            </View>
          ))}
          <View style={[styles.names, { borderColor: theme.border }]}>
            <Text style={[type.monoLabel, { color: theme.text3 }]}>{t("redact.names.title")}</Text>
            {prefs.names.length ? (
              <View style={styles.chips}>
                {prefs.names.map((n) => (
                  <Pressable key={n} testID={`redact-name-${n}`} accessibilityRole="button" accessibilityLabel={t("redact.names.remove", { name: n })} onPress={() => prefs.setNames(prefs.names.filter((x) => x !== n))} style={[shape.chip, styles.chip, { backgroundColor: theme.surface2, borderColor: theme.border }]}>
                    <Text style={[type.caption, { color: theme.text }]}>{n}</Text>
                    <Icon name="x" size={12} color={theme.text3} />
                  </Pressable>
                ))}
              </View>
            ) : null}
            <View style={styles.addRow}>
              <TextInput
                testID="redact-name-input"
                value={newName}
                onChangeText={setNewName}
                onSubmitEditing={addName}
                placeholder={t("redact.names.placeholder")}
                placeholderTextColor={theme.text3}
                autoCorrect={false}
                style={[shape.field, styles.field, { backgroundColor: theme.well, borderColor: theme.border, color: theme.text }]}
              />
              <Pressable testID="redact-name-add" accessibilityRole="button" disabled={newName.trim().length < 2} onPress={addName} style={[shape.control, styles.add, { borderColor: theme.border, opacity: newName.trim().length < 2 ? 0.45 : 1 }]}>
                <Text style={[type.bodySmall, { color: theme.text }]}>{t("redact.names.add")}</Text>
              </Pressable>
            </View>
          </View>
          <Text style={[type.monoLabel, styles.pad, { color: theme.text3 }]}>{t("redact.preview")}</Text>
          <View testID="redact-preview" style={[styles.preview, { backgroundColor: theme.well, borderColor: theme.border }]}>
            <Text style={[type.bodySmall, { color: theme.text2, writingDirection: dir, textAlign: dir === "rtl" ? "right" : "left" }]}>{preview || t("redact.none")}</Text>
          </View>
          <Pressable testID="redact-apply" accessibilityRole="button" disabled={!found.length} onPress={apply} style={[shape.control, styles.cta, styles.pad, { backgroundColor: found.length ? theme.ctaFill : theme.surface2 }]}>
            <Text style={[type.body, type.strong, { color: found.length ? theme.ctaText : theme.text3 }]}>{t("redact.apply", { count: found.length })}</Text>
          </Pressable>
          <Text style={[type.caption, styles.pad, styles.centered, { color: theme.text3 }]}>{t("redact.memoryNote")}</Text>
        </>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  pad: { marginHorizontal: 12, marginTop: 8 },
  centered: { textAlign: "center" },
  card: { marginHorizontal: 12, padding: 14, borderRadius: radius.card, borderWidth: 1, gap: 8 },
  cta: { alignItems: "center", justifyContent: "center", minHeight: 44 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, marginHorizontal: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  grow: { flex: 1, gap: 2 },
  names: { marginHorizontal: 12, marginTop: 12, paddingTop: 12, gap: 8, borderTopWidth: StyleSheet.hairlineWidth },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1 },
  addRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  field: { flex: 1, minHeight: 40, borderWidth: 1, paddingHorizontal: 10 },
  add: { borderWidth: 1, minHeight: 40, paddingHorizontal: 14, justifyContent: "center" },
  preview: { marginHorizontal: 12, marginTop: 4, padding: 10, borderRadius: radius.control, borderWidth: 1, maxHeight: 140 },
});
