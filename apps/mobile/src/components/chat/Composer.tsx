import { useState, type RefObject } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import { directionOf } from "@inborn/core";
import { Icon, radius } from "@inborn/ui";
import { useFontScale, useTheme } from "../../lib/theme";
import { useType } from "../../services/type";
import { DISABLED_OPACITY } from "../shell/primitives";

interface ComposerProps {
  value: string;
  onChange: (text: string) => void;
  onSend: () => void;
  onStop: () => void;
  busy: boolean;
  disabled?: boolean;
  /** Editing the last user turn: the field carries its text and a cancel affordance (§7.1 edit + regenerate). */
  editing?: boolean;
  onCancelEdit?: () => void;
  placeholder: string;
  incognito: boolean;
  /** Opens the attach-documents sheet (§7.3); absent = the [+] stays disabled. */
  onAttach?: () => void;
  attachedCount?: number;
  /** The mic is a §12.3 value moment: Free sees the paywall, Pro hears "coming with voice". */
  onMic?: () => void;
  inputRef?: RefObject<TextInput | null>;
}

const LINE = 25;

/** Anchored composer (§9.6): well field, amber focus border, grows to six lines, 44 pt targets; attach and mic sit in text-2, dimmed while they wait for M5. */
export function Composer({ value, onChange, onSend, onStop, busy, disabled, editing, onCancelEdit, placeholder, incognito, onAttach, attachedCount = 0, onMic, inputRef }: ComposerProps) {
  const theme = useTheme();
  const type = useType();
  const { t } = useTranslation();
  const scale = useFontScale() * type.scale;
  const [focused, setFocused] = useState(false);
  const dir = value ? directionOf(value) : "ltr";
  const canSend = !!value.trim() && !disabled && !busy;
  return (
    <View style={styles.wrap}>
      {editing ? (
        <View style={styles.editRow}>
          <Text style={[type.monoLabel, { color: theme.accent }]}>{t("chat.editing")}</Text>
          <Pressable testID="cancel-edit" accessibilityRole="button" onPress={onCancelEdit} hitSlop={8} style={styles.cancelEdit}>
            <Text style={[type.caption, { color: theme.text2 }]}>{t("chats.cancel")}</Text>
          </Pressable>
        </View>
      ) : null}
      <View style={[styles.box, { backgroundColor: incognito ? theme.bg : theme.well, borderColor: focused ? `${theme.accent}99` : theme.border }]}>
        <Pressable
          testID="attach"
          accessibilityRole="button"
          accessibilityLabel={t("chat.attach")}
          accessibilityState={{ disabled: !onAttach }}
          disabled={!onAttach}
          onPress={onAttach}
          style={[styles.iconBtn, { opacity: onAttach ? 1 : DISABLED_OPACITY }]}
        >
          <Icon name={attachedCount ? "paperclip" : "plus"} size={22} color={attachedCount ? theme.accent : theme.text2} />
          {attachedCount ? (
            <View style={[styles.badge, { backgroundColor: theme.accent }]}>
              <Text allowFontScaling={false} style={[styles.badgeText, { color: theme.bg }]}>
                {attachedCount}
              </Text>
            </View>
          ) : null}
        </Pressable>
        <TextInput
          ref={inputRef}
          testID="composer-input"
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={theme.text3}
          multiline
          editable={!disabled}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={[type.body, styles.input, { color: theme.text, maxHeight: LINE * 6 * scale + 20, writingDirection: dir, textAlign: dir === "rtl" ? "right" : "left" }]}
          accessibilityLabel={placeholder}
        />
        <Pressable
          testID="mic"
          accessibilityRole="button"
          accessibilityLabel={t("chat.dictate")}
          accessibilityState={{ disabled: !onMic }}
          disabled={!onMic}
          onPress={onMic}
          style={[styles.iconBtn, { opacity: onMic ? 1 : DISABLED_OPACITY }]}
        >
          <Icon name="mic" size={22} color={theme.text2} />
        </Pressable>
        {busy ? (
          <Pressable testID="stop" accessibilityRole="button" accessibilityLabel={t("chat.stop")} onPress={onStop} style={[styles.send, { backgroundColor: theme.danger }]}>
            <Icon name="stop" size={14} color={theme.ctaFill} fill />
          </Pressable>
        ) : (
          <Pressable testID="send" accessibilityRole="button" accessibilityLabel={t("chat.send")} accessibilityState={{ disabled: !canSend }} disabled={!canSend} onPress={onSend} style={[styles.send, { backgroundColor: theme.ctaFill, opacity: canSend ? 1 : 0.45 }]}>
            <Icon name="arrowUp" size={20} color={theme.ctaText} strokeWidth={2.5} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 12, paddingTop: 6, paddingBottom: 8, gap: 6 },
  editRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 4 },
  cancelEdit: { minHeight: 28, justifyContent: "center" },
  box: { flexDirection: "row", alignItems: "flex-end", borderWidth: 1, borderRadius: radius.control, paddingLeft: 4, paddingRight: 4 },
  iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  badge: { position: "absolute", top: 6, right: 4, minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 4, alignItems: "center", justifyContent: "center" },
  badgeText: { fontSize: 10, fontWeight: "700" },
  input: { flex: 1, minHeight: 44, paddingVertical: 10, paddingHorizontal: 4 },
  send: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", margin: 4 },
});
