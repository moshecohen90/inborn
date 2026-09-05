import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import { BUILT_IN_PERSONAS, type Persona } from "@inborn/core";
import { useTheme } from "../../lib/theme";
import { modelLabel } from "../../lib/models";
import { PersonaGlyph } from "./PersonaGlyph";
import { Sheet } from "./Sheet";
import { shape, type } from "./styles";

export interface ChatSettings {
  personaId?: string;
  systemPrompt: string;
  thinking: boolean;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  value: ChatSettings;
  onSave: (next: ChatSettings) => void;
  customPersonas: Persona[];
  modelId: string;
  /** Instant cannot think (brief); other models can when their template supports it. */
  thinkingAvailable: boolean;
}

/** Per-chat system prompt, persona and thinking switch (§7.1, §7.6). Saved on close. */
export function ChatSettingsSheet({ visible, onClose, value, onSave, customPersonas, modelId, thinkingAvailable }: Props) {
  const theme = useTheme();
  const { t } = useTranslation();
  const [draft, setDraft] = useState<ChatSettings>(value);
  useEffect(() => {
    if (visible) setDraft(value);
  }, [visible, value]);
  const personas = [...BUILT_IN_PERSONAS, ...customPersonas];
  const done = () => {
    onSave({ ...draft, systemPrompt: draft.systemPrompt.trim() });
    onClose();
  };
  return (
    <Sheet visible={visible} onClose={done} title={t("chatSettings.title")} testID="chat-settings">
      <View style={styles.body}>
        <Text style={[type.monoLabel, { color: theme.text3 }]}>{t("chatSettings.model")}</Text>
        <View style={[shape.chip, styles.modelChip, { backgroundColor: theme.surface2, borderColor: theme.border }]}>
          <Text style={[type.monoLabel, { color: theme.text2 }]}>▣ {modelLabel(modelId)}</Text>
        </View>
        <Text style={[type.monoLabel, { color: theme.text3 }]}>{t("chatSettings.persona")}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.personas}>
          {personas.map((p) => {
            const active = (draft.personaId ?? BUILT_IN_PERSONAS[0]!.id) === p.id;
            return (
              <Pressable key={p.id} testID={`settings-persona-${p.id}`} accessibilityRole="radio" accessibilityState={{ selected: active }} onPress={() => setDraft((d) => ({ ...d, personaId: p.id }))} style={[shape.chip, styles.personaChip, { borderColor: active ? theme.accent : theme.border, backgroundColor: theme.surface2 }]}>
                <PersonaGlyph icon={p.icon} size={22} active={active} />
                <Text style={[type.bodySmall, { color: active ? theme.accent : theme.text }]}>{p.builtIn ? t(`persona.${p.id.replace("builtin:", "")}`) : p.name}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <Text style={[type.monoLabel, { color: theme.text3 }]}>{t("chatSettings.systemPrompt")}</Text>
        <TextInput
          testID="system-prompt"
          value={draft.systemPrompt}
          onChangeText={(systemPrompt) => setDraft((d) => ({ ...d, systemPrompt }))}
          placeholder={t("chatSettings.systemPromptPlaceholder")}
          placeholderTextColor={theme.text3}
          multiline
          style={[shape.field, styles.prompt, { backgroundColor: theme.well, borderColor: theme.border, color: theme.text }]}
        />
        <View style={styles.switchRow}>
          <View style={styles.grow}>
            <Text style={[type.body, { color: thinkingAvailable ? theme.text : theme.text3 }]}>{t("chatSettings.thinking")}</Text>
            <Text style={[type.caption, { color: theme.text3 }]}>{thinkingAvailable ? t("chatSettings.thinkingHint") : t("chatSettings.thinkingOff", { model: modelLabel(modelId) })}</Text>
          </View>
          <Switch testID="thinking-switch" value={thinkingAvailable && draft.thinking} disabled={!thinkingAvailable} onValueChange={(thinking) => setDraft((d) => ({ ...d, thinking }))} trackColor={{ true: theme.text2, false: theme.border }} />
        </View>
        <Pressable testID="settings-done" accessibilityRole="button" onPress={done} style={[shape.control, { backgroundColor: theme.ctaFill, alignSelf: "flex-end" }]}>
          <Text style={[type.body, type.strong, { color: theme.ctaText }]}>{t("chats.save")}</Text>
        </Pressable>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 12, gap: 10, paddingBottom: 8 },
  modelChip: { alignSelf: "flex-start" },
  personas: { gap: 8, paddingVertical: 2 },
  personaChip: { flexDirection: "row", gap: 8, minHeight: 36, paddingLeft: 6, paddingRight: 14 },
  prompt: { minHeight: 96, textAlignVertical: "top" },
  switchRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  grow: { flex: 1, gap: 2 },
});
