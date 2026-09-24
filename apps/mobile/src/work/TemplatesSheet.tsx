import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import { PACKS, fillTemplate, placeholdersOf, type PackTemplate, type ProfessionPack } from "@inborn/core";
import { useTheme } from "../lib/theme";
import { Sheet, SheetItem } from "../components/chat/Sheet";
import { shape } from "../components/chat/styles";
import { useType } from "../services/type";
import { Button } from "../components/shell/primitives";
import { useWorkGate } from "./hooks";
import { WorkTag } from "./WorkTag";
import { openPaywall } from "../licence/openPaywall";
import { afterSheetClose } from "../lib/sheetHandover";

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Puts the filled template into the composer. */
  onInsert: (text: string) => void;
}

/** Templates library (§7.6, Work): pack → declaration → template → optional blanks → insert. Free/Pro see the packs and the one price line. */
export function TemplatesSheet({ visible, onClose, onInsert }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const type = useType();
  const gate = useWorkGate();
  const [pack, setPack] = useState<ProfessionPack | null>(null);
  const [template, setTemplate] = useState<PackTemplate | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!visible) {
      setPack(null);
      setTemplate(null);
      setValues({});
    }
  }, [visible]);

  const insert = () => {
    if (!template) return;
    onInsert(fillTemplate(template.body, values));
    onClose();
  };
  const title = template ? template.title : pack ? pack.name : t("templates.title");
  const back = () => (template ? setTemplate(null) : setPack(null));
  const unlock = () => {
    onClose();
    afterSheetClose(() => openPaywall("templates"));
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={title} testID="templates-sheet">
      {pack || template ? (
        <Pressable testID="templates-back" accessibilityRole="button" onPress={back} style={styles.back}>
          <Text style={[type.caption, { color: theme.accent }]}>‹ {t("templates.back")}</Text>
        </Pressable>
      ) : null}
      {!pack ? (
        <>
          {gate.templatesLocked ? (
            <View style={[styles.moment, { borderColor: theme.border, backgroundColor: theme.surface2 }]}>
              <Text style={[type.bodySmall, styles.grow, { color: theme.text2 }]}>{t("work.moment.templates", { price: gate.price })}</Text>
              <WorkTag onPress={unlock} />
            </View>
          ) : null}
          {PACKS.map((p) => (
            <SheetItem key={p.id} testID={`pack-${p.id}`} label={p.name} hint={p.audience} onPress={() => setPack(p)} />
          ))}
        </>
      ) : !template ? (
        <>
          <View style={[styles.declaration, { borderColor: theme.border, backgroundColor: theme.surface2 }]}>
            <Text style={[type.monoLabel, { color: theme.text3 }]}>{t("templates.declaration")}</Text>
            <Text testID="pack-declaration" style={[type.bodySmall, { color: theme.text2 }]}>
              {pack.declaration}
            </Text>
          </View>
          {pack.templates.map((tp) => (
            <SheetItem key={tp.id} testID={`template-${tp.id}`} label={tp.title} hint={tp.purpose} onPress={() => (gate.templatesLocked ? unlock() : setTemplate(tp))} trailing={gate.templatesLocked ? <WorkTag onPress={unlock} /> : undefined} />
          ))}
        </>
      ) : (
        <View style={styles.fill}>
          <Text style={[type.monoLabel, { color: theme.text3 }]}>{t("templates.fill")}</Text>
          {placeholdersOf(template.body).map((name) => (
            <TextInput key={name} testID={`slot-${name}`} value={values[name] ?? ""} onChangeText={(v) => setValues((s) => ({ ...s, [name]: v }))} placeholder={name.replace(/_/g, " ")} placeholderTextColor={theme.text3} style={[shape.field, { backgroundColor: theme.well, borderColor: theme.border, color: theme.text }]} />
          ))}
          <Text style={[type.caption, { color: theme.text3 }]} numberOfLines={6}>
            {fillTemplate(template.body, values)}
          </Text>
          <Button testID="template-insert" title={t("templates.insert")} onPress={insert} />
        </View>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  back: { paddingHorizontal: 12, paddingVertical: 6 },
  moment: { flexDirection: "row", alignItems: "center", gap: 10, marginHorizontal: 12, marginBottom: 6, padding: 10, borderWidth: 1, borderRadius: 10 },
  grow: { flex: 1 },
  declaration: { marginHorizontal: 12, marginBottom: 6, padding: 10, borderWidth: 1, borderRadius: 10, gap: 4 },
  fill: { paddingHorizontal: 12, paddingVertical: 6, gap: 8 },
});
