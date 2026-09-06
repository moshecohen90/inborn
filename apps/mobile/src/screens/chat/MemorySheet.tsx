import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import { BUILT_IN_PERSONAS, type Chat, type ChatStore, type MemoryFact, type Persona } from "@inborn/core";
import { paywallFor } from "@inborn/core";
import { useEntitlement } from "../../licence";
import { useTheme } from "../../lib/theme";
import { ProTag, Sheet } from "../../components/chat/Sheet";
import { shape, type } from "../../components/chat/styles";

interface Props {
  visible: boolean;
  onClose: () => void;
  store: ChatStore;
  /** Memory is Pro (§7.9): the panel is visible to everyone, adding a fact opens the paywall on Free. */
  onUnlock?: () => void;
}

/**
 * Transparent memory panel (§8.5 S42): every "fact about me" is visible, editable and deletable, with its source chat,
 * a switch per persona and a master switch. Pro-gated: the free tier sees the panel but cannot add facts.
 */
export function MemorySheet({ visible, onClose, store, onUnlock }: Props) {
  const theme = useTheme();
  const { t } = useTranslation();
  const { tier } = useEntitlement();
  const locked = paywallFor(tier, { kind: "feature", feature: "memory" });
  const unlock = () => {
    onClose();
    setTimeout(() => onUnlock?.(), 320);
  };
  const [facts, setFacts] = useState<MemoryFact[]>([]);
  const [chats, setChats] = useState<Map<string, Chat>>(new Map());
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [enabled, setEnabled] = useState(true);
  const [perPersona, setPerPersona] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<{ id?: string; content: string } | null>(null);

  const refresh = useCallback(async () => {
    const [list, chatList, custom, on] = await Promise.all([store.library.listMemory(), store.listChats(), store.library.listPersonas(), store.memoryEnabled()]);
    setFacts(list);
    setChats(new Map(chatList.map((c) => [c.id, c])));
    const all = [...BUILT_IN_PERSONAS, ...custom];
    setPersonas(all);
    setEnabled(on);
    const flags: Record<string, boolean> = {};
    for (const p of all) flags[p.id] = await store.memoryEnabledFor(p.id);
    setPerPersona(flags);
  }, [store]);
  useEffect(() => {
    if (visible) refresh().catch(() => undefined);
  }, [visible, refresh]);

  const personaName = (p: Persona) => (p.builtIn ? t(`persona.${p.id.replace("builtin:", "")}`) : p.name);
  const save = async () => {
    if (!editing) return;
    const content = editing.content.trim();
    if (content) {
      if (editing.id) await store.library.updateMemory(editing.id, { content });
      else await store.library.addMemory({ content });
    }
    setEditing(null);
    await refresh();
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={t("memory.title")} testID="memory-sheet">
      <View style={styles.body}>
        <View style={styles.switchRow}>
          <View style={styles.grow}>
            <Text style={[type.body, { color: theme.text }]}>{t("memory.master")}</Text>
            <Text style={[type.caption, { color: theme.text3 }]}>{t("memory.explain")}</Text>
          </View>
          {locked ? <ProTag onPress={unlock} /> : null}
          <Switch
            testID="memory-master"
            value={enabled}
            onValueChange={(on) => {
              setEnabled(on);
              void store.setMemoryEnabled(on);
            }}
            trackColor={{ true: theme.text2, false: theme.border }}
          />
        </View>
        <Text style={[type.monoLabel, styles.section, { color: theme.text3 }]}>{t("memory.facts", { count: facts.length })}</Text>
        {facts.map((f) => (
          <View key={f.id} testID={`memory-${f.id}`} style={[styles.fact, { borderColor: theme.border }]}>
            <View style={styles.grow}>
              <Text style={[type.body, { color: f.enabled ? theme.text : theme.text3 }]}>{f.content}</Text>
              <Text style={[type.caption, { color: theme.text3 }]}>
                {f.sourceChatId && chats.get(f.sourceChatId) ? t("memory.from", { chat: chats.get(f.sourceChatId)!.title || t("newChat.title") }) : t("memory.manual")}
                {f.personaId ? ` · ${personas.find((p) => p.id === f.personaId) ? personaName(personas.find((p) => p.id === f.personaId)!) : ""}` : ""}
              </Text>
              <View style={styles.factActions}>
                <Pressable testID={`memory-edit-${f.id}`} accessibilityRole="button" onPress={() => setEditing({ id: f.id, content: f.content })} hitSlop={6} style={styles.textBtn}>
                  <Text style={[type.caption, { color: theme.accent }]}>{t("memory.edit")}</Text>
                </Pressable>
                <Pressable testID={`memory-delete-${f.id}`} accessibilityRole="button" onPress={() => void store.library.deleteMemory(f.id).then(refresh)} hitSlop={6} style={styles.textBtn}>
                  <Text style={[type.caption, { color: theme.danger }]}>{t("chats.delete")}</Text>
                </Pressable>
              </View>
            </View>
            <Switch value={f.enabled} onValueChange={(on) => void store.library.updateMemory(f.id, { enabled: on }).then(refresh)} trackColor={{ true: theme.text2, false: theme.border }} />
          </View>
        ))}
        {!facts.length ? <Text style={[type.bodySmall, { color: theme.text3 }]}>{t("memory.empty")}</Text> : null}
        {editing ? (
          <View style={styles.editor}>
            <TextInput testID="memory-input" autoFocus value={editing.content} onChangeText={(content) => setEditing({ ...editing, content })} placeholder={t("memory.placeholder")} placeholderTextColor={theme.text3} multiline style={[shape.field, { backgroundColor: theme.well, borderColor: theme.border, color: theme.text }]} />
            <View style={styles.actions}>
              <Pressable accessibilityRole="button" onPress={() => setEditing(null)} style={shape.control}>
                <Text style={[type.body, { color: theme.text2 }]}>{t("chats.cancel")}</Text>
              </Pressable>
              <Pressable testID="memory-save" accessibilityRole="button" onPress={() => void save()} style={[shape.control, { backgroundColor: theme.ctaFill }]}>
                <Text style={[type.body, type.strong, { color: theme.ctaText }]}>{t("chats.save")}</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <Pressable testID="memory-add" accessibilityRole="button" onPress={() => (locked ? unlock() : setEditing({ content: "" }))} style={[shape.control, styles.add, { borderColor: locked ? theme.accent : theme.border }]}>
            <Text style={[type.body, { color: theme.text }]}>{t("memory.add")}</Text>
          </Pressable>
        )}
        <Text style={[type.monoLabel, styles.section, { color: theme.text3 }]}>{t("memory.perPersona")}</Text>
        {personas.map((p) => (
          <View key={p.id} style={styles.switchRow}>
            <Text style={[type.body, styles.grow, { color: theme.text }]}>{personaName(p)}</Text>
            <Switch
              testID={`memory-persona-${p.id}`}
              value={perPersona[p.id] ?? true}
              onValueChange={(on) => {
                setPerPersona((f) => ({ ...f, [p.id]: on }));
                void store.setMemoryEnabledFor(p.id, on);
              }}
              trackColor={{ true: theme.text2, false: theme.border }}
            />
          </View>
        ))}
        {facts.length ? (
          <Pressable testID="memory-clear" accessibilityRole="button" onPress={() => void store.library.clearMemory().then(refresh)} style={[shape.control, styles.add, { borderColor: theme.border }]}>
            <Text style={[type.body, { color: theme.danger }]}>{t("memory.clear")}</Text>
          </Pressable>
        ) : null}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 12, gap: 10, paddingBottom: 8 },
  switchRow: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 44 },
  grow: { flex: 1, gap: 2 },
  section: { paddingTop: 8 },
  fact: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderRadius: 10, padding: 12 },
  factActions: { flexDirection: "row", gap: 16, marginTop: 4 },
  textBtn: { minHeight: 28, justifyContent: "center" },
  editor: { gap: 8 },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: 4 },
  add: { borderWidth: 1 },
});
