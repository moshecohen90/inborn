import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import { BUILT_IN_PERSONAS, PERSONA_ICONS, paywallFor, validatePersona, type ChatStore, type Persona, type PersonaIcon, type PersonaInput } from "@inborn/core";
import { useEntitlement } from "../../licence";
import { useTheme } from "../../lib/theme";
import { PersonaGlyph } from "../../components/chat/PersonaGlyph";
import { ProTag, Sheet, SheetItem } from "../../components/chat/Sheet";
import { shape } from "../../components/chat/styles";
import { useType } from "../../services/type";

interface Props {
  visible: boolean;
  onClose: () => void;
  store: ChatStore;
  /** Fires after any create / edit / delete so the caller can refresh chips. */
  onChanged?: () => void;
  /** The 4th custom persona is a §12.3 value moment: the add row opens the paywall instead. */
  onUnlock?: () => void;
}

type Draft = { id?: string; name: string; icon: PersonaIcon; systemPrompt: string; temperature: string; disclaimer: string };
const empty = (): Draft => ({ name: "", icon: "spark", systemPrompt: "", temperature: "", disclaimer: "" });

/** Persona library (§8.5 S41): four built-ins, custom ones with name, glyph, prompt, temperature, fixed disclaimer. */
export function PersonasSheet({ visible, onClose, store, onChanged, onUnlock }: Props) {
  const type = useType();
  const theme = useTheme();
  const { t } = useTranslation();
  const { tier } = useEntitlement();
  const [custom, setCustom] = useState<Persona[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  const refresh = useCallback(() => store.library.listPersonas().then(setCustom).catch(() => undefined), [store]);
  useEffect(() => {
    if (visible) void refresh();
  }, [visible, refresh]);

  const locked = paywallFor(tier, { kind: "persona", existing: custom.length });
  const unlock = () => {
    onClose();
    setTimeout(() => onUnlock?.(), 320);
  };
  const edit = (p: Persona) => setDraft({ id: p.id, name: p.name, icon: p.icon, systemPrompt: p.systemPrompt, temperature: p.temperature === undefined ? "" : String(p.temperature), disclaimer: p.disclaimer ?? "" });

  const save = async () => {
    if (!draft) return;
    const temperature = draft.temperature.trim() ? Number(draft.temperature) : undefined;
    const input: PersonaInput = {
      ...(draft.id ? { id: draft.id } : {}),
      name: draft.name,
      icon: draft.icon,
      systemPrompt: draft.systemPrompt.trim(),
      ...(temperature !== undefined ? { temperature: Number.isFinite(temperature) ? temperature : -1 } : {}),
      ...(draft.disclaimer.trim() ? { disclaimer: draft.disclaimer.trim() } : {}),
    };
    const problems = validatePersona(input);
    setErrors(problems);
    if (problems.length) return;
    await store.library.savePersona(input);
    setDraft(null);
    await refresh();
    onChanged?.();
  };

  const remove = async (id: string) => {
    await store.library.deletePersona(id);
    setDraft(null);
    await refresh();
    onChanged?.();
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={draft ? (draft.id ? t("personas.edit") : t("personas.new")) : t("personas.title")} testID="personas-sheet">
      {draft ? (
        <View style={styles.form}>
          <TextInput testID="persona-name" value={draft.name} onChangeText={(name) => setDraft({ ...draft, name })} placeholder={t("personas.name")} placeholderTextColor={theme.text3} style={[shape.field, { backgroundColor: theme.well, borderColor: theme.border, color: theme.text }]} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.icons}>
            {PERSONA_ICONS.map((icon) => (
              <Pressable key={icon} testID={`persona-icon-${icon}`} accessibilityRole="radio" accessibilityLabel={icon} accessibilityState={{ selected: draft.icon === icon }} onPress={() => setDraft({ ...draft, icon })}>
                <PersonaGlyph icon={icon} size={40} active={draft.icon === icon} />
              </Pressable>
            ))}
          </ScrollView>
          <TextInput testID="persona-prompt" value={draft.systemPrompt} onChangeText={(systemPrompt) => setDraft({ ...draft, systemPrompt })} placeholder={t("personas.prompt")} placeholderTextColor={theme.text3} multiline style={[shape.field, styles.prompt, { backgroundColor: theme.well, borderColor: theme.border, color: theme.text }]} />
          <View style={styles.pair}>
            <TextInput testID="persona-temperature" value={draft.temperature} onChangeText={(temperature) => setDraft({ ...draft, temperature })} placeholder={t("personas.temperature")} placeholderTextColor={theme.text3} keyboardType="decimal-pad" style={[shape.field, styles.half, { backgroundColor: theme.well, borderColor: theme.border, color: theme.text }]} />
            <View style={[shape.field, styles.half, styles.readonly, { borderColor: theme.border }]}>
              <Text style={[type.bodySmall, { color: theme.text3 }]}>{t("personas.defaultModelHint")}</Text>
            </View>
          </View>
          <TextInput testID="persona-disclaimer" value={draft.disclaimer} onChangeText={(disclaimer) => setDraft({ ...draft, disclaimer })} placeholder={t("personas.disclaimer")} placeholderTextColor={theme.text3} style={[shape.field, { backgroundColor: theme.well, borderColor: theme.border, color: theme.text }]} />
          {errors.length ? (
            <Text testID="persona-errors" style={[type.caption, { color: theme.danger }]}>
              {errors.map((e) => t(`personas.error.${e}`)).join(" · ")}
            </Text>
          ) : null}
          <View style={styles.actions}>
            {draft.id ? (
              <Pressable testID="persona-delete" accessibilityRole="button" onPress={() => void remove(draft.id!)} style={[shape.control, styles.left]}>
                <Text style={[type.body, { color: theme.danger }]}>{t("chats.delete")}</Text>
              </Pressable>
            ) : null}
            <Pressable accessibilityRole="button" onPress={() => setDraft(null)} style={shape.control}>
              <Text style={[type.body, { color: theme.text2 }]}>{t("chats.cancel")}</Text>
            </Pressable>
            <Pressable testID="persona-save" accessibilityRole="button" onPress={() => void save()} style={[shape.control, { backgroundColor: theme.ctaFill }]}>
              <Text style={[type.body, type.strong, { color: theme.ctaText }]}>{t("chats.save")}</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={styles.list}>
          <Text style={[type.monoLabel, styles.section, { color: theme.text3 }]}>{t("personas.builtIn")}</Text>
          {BUILT_IN_PERSONAS.map((p) => (
            <View key={p.id} style={styles.row}>
              <PersonaGlyph icon={p.icon} />
              <View style={styles.grow}>
                <Text style={[type.body, { color: theme.text }]}>{t(`persona.${p.id.replace("builtin:", "")}`)}</Text>
                <Text numberOfLines={2} style={[type.caption, { color: theme.text3 }]}>
                  {p.systemPrompt}
                </Text>
              </View>
            </View>
          ))}
          <Text style={[type.monoLabel, styles.section, { color: theme.text3 }]}>{t("personas.custom", { count: custom.length })}</Text>
          {custom.map((p) => (
            <Pressable key={p.id} testID={`persona-row-${p.id}`} accessibilityRole="button" onPress={() => edit(p)} style={({ pressed }) => [styles.row, { backgroundColor: pressed ? theme.surface2 : "transparent" }]}>
              <PersonaGlyph icon={p.icon} />
              <View style={styles.grow}>
                <Text style={[type.body, { color: theme.text }]}>{p.name}</Text>
                <Text numberOfLines={2} style={[type.caption, { color: theme.text3 }]}>
                  {p.systemPrompt || t("personas.noPrompt")}
                </Text>
              </View>
            </Pressable>
          ))}
          {!custom.length ? <Text style={[type.bodySmall, styles.empty, { color: theme.text3 }]}>{t("personas.empty")}</Text> : null}
          <SheetItem testID="persona-add" label={t("personas.add")} hint={locked ? t("personas.limit", { count: custom.length }) : undefined} onPress={() => (locked ? unlock() : setDraft(empty()))} trailing={locked ? <ProTag onPress={unlock} /> : undefined} />
        </View>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  list: { paddingBottom: 8 },
  section: { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 6 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  grow: { flex: 1, gap: 2 },
  empty: { paddingHorizontal: 12, paddingVertical: 8 },
  form: { paddingHorizontal: 12, gap: 10, paddingBottom: 8 },
  icons: { gap: 8, paddingVertical: 2 },
  prompt: { minHeight: 110, textAlignVertical: "top" },
  pair: { flexDirection: "row", gap: 8 },
  half: { flex: 1 },
  readonly: { justifyContent: "center" },
  actions: { flexDirection: "row", justifyContent: "flex-end", alignItems: "center", gap: 4 },
  left: { marginRight: "auto" },
});
