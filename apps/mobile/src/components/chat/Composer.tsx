import { useEffect, useRef, useState, type RefObject } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import { directionOf } from "@inborn/core";
import { Icon, radius } from "@inborn/ui";
import { useFontScale, useTheme } from "../../lib/theme";
import { useType } from "../../services/type";
import { DISABLED_OPACITY } from "../shell/primitives";
import { captureHardwareEnter } from "../../../modules/hardware-keys";
import { composerCanSend } from "../../images/intake";

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
  /** Tap: dictation on / off (§8.2). Long-press: the microphone sheet (whisper, hands-free). */
  onMic?: () => void;
  onMicLongPress?: () => void;
  /** Dictation state: the field pulses amber while listening, the mic turns into a stop square. */
  mic?: "idle" | "starting" | "listening" | "transcribing";
  inputRef?: RefObject<TextInput | null>;
  /** Photos picked but not yet scaled into the composer: send waits for them (F350). */
  preparing?: number;
}

const LINE = 25;

const web = Platform.OS === "web";
/* A <textarea> starts two rows tall, which left an empty field a line above the [+] and send at every width (F111);
   `numberOfLines` is an Android prop that would clamp the field there, so the one row is asked for on the web alone. */
const webField = web ? { numberOfLines: 1 } : {};
/** One line of text plus the field's own padding: the height the empty field and the 44 pt buttons share. */
const MIN_FIELD = 45;
/* The box already draws the amber focus border; the browser's own ring on top of it read as a second, misaligned field. */
const webInput = web ? ({ outlineStyle: "none" } as object) : null;

/** Anchored composer (§9.6): well field, amber focus border, grows to six lines, 44 pt targets; attach and mic sit in text-2, dimmed while they wait for M5. */
export function Composer({ value, onChange, onSend, onStop, busy, disabled, editing, onCancelEdit, placeholder, incognito, onAttach, attachedCount = 0, onMic, onMicLongPress, mic = "idle", inputRef, preparing = 0 }: ComposerProps) {
  const theme = useTheme();
  const type = useType();
  const { t } = useTranslation();
  const scale = useFontScale() * type.scale;
  const [focused, setFocused] = useState(false);
  const dir = value ? directionOf(value) : "ltr";
  const canSend = composerCanSend({ text: value, preparing, busy, disabled });
  /* A physical keyboard's Enter sends while the field has focus; Shift+Enter still breaks the line (QA T28, F108). Latest props through a ref: the capture is armed once per focus. */
  const enter = useRef({ canSend, onSend });
  enter.current = { canSend, onSend };
  useEffect(() => {
    if (!focused) return;
    return captureHardwareEnter(() => {
      if (!enter.current.canSend) return false;
      enter.current.onSend();
      return true;
    });
  }, [focused]);
  const maxHeight = LINE * 6 * scale + 20;
  const field = useRef<TextInput | null>(null);
  /* react-native-web renders a plain <textarea>, which never grows with its content, so §9.6's growth to six lines is
     measured here; `auto` first, or the previous height would be the floor of the next measurement. */
  useEffect(() => {
    const node = field.current as unknown as HTMLTextAreaElement | null;
    if (!web || !node) return;
    node.style.height = "auto";
    node.style.height = `${Math.min(Math.max(node.scrollHeight, MIN_FIELD), maxHeight)}px`;
  }, [value, maxHeight]);
  const listening = mic === "listening";
  const micBusy = mic === "starting" || mic === "transcribing";
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
      {preparing > 0 ? (
        <View testID="composer-preparing" aria-live="polite" style={styles.editRow}>
          <ActivityIndicator size="small" color={theme.accent} />
          <Text style={[type.monoLabel, styles.preparing, { color: theme.accent }]}>{t("chat.image.preparing", { count: preparing })}</Text>
        </View>
      ) : null}
      <View testID={listening ? "composer-listening" : undefined} style={[styles.box, { backgroundColor: incognito ? theme.bg : theme.well, borderColor: listening ? theme.accent : focused ? `${theme.accent}99` : theme.border }]}>
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
          ref={(node) => {
            field.current = node;
            if (inputRef) inputRef.current = node;
          }}
          testID="composer-input"
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={theme.text3}
          multiline
          {...webField}
          editable={!disabled}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={[type.body, styles.input, webInput, { color: theme.text, maxHeight, writingDirection: dir, textAlign: dir === "rtl" ? "right" : "left" }]}
        />
        <Pressable
          testID="mic"
          accessibilityRole="button"
          accessibilityLabel={listening ? t("voice.stopDictation") : t("chat.dictate")}
          accessibilityHint={onMicLongPress ? t("voice.mic.conversationHint") : undefined}
          accessibilityState={{ disabled: !onMic, busy: micBusy }}
          disabled={!onMic}
          onPress={onMic}
          onLongPress={onMicLongPress}
          delayLongPress={400}
          style={[styles.iconBtn, { opacity: onMic ? 1 : DISABLED_OPACITY }]}
        >
          {listening ? <View style={[styles.micStop, { backgroundColor: theme.danger }]} /> : <Icon name="mic" size={22} color={micBusy ? theme.accent : theme.text2} />}
        </Pressable>
        {busy ? (
          /* Stopping your own answer is not a breach: §9.2 keeps danger for UNSEALED, deletion and errors (QA F246). */
          <Pressable testID="stop" accessibilityRole="button" accessibilityLabel={t("chat.stop")} onPress={onStop} style={styles.iconBtn}>
            <View style={[styles.sendDot, { backgroundColor: theme.ctaFill }]}>
              <Icon name="stop" size={14} color={theme.ctaText} fill />
            </View>
          </Pressable>
        ) : (
          <Pressable testID="send" accessibilityRole="button" accessibilityLabel={t("chat.send")} accessibilityState={{ disabled: !canSend }} disabled={!canSend} onPress={onSend} style={[styles.iconBtn, { opacity: canSend ? 1 : 0.45 }]}>
            <View style={[styles.sendDot, { backgroundColor: theme.ctaFill }]}>
              <Icon name="arrowUp" size={20} color={theme.ctaText} strokeWidth={2.5} />
            </View>
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
  preparing: { flex: 1, marginLeft: 8 },
  box: { flexDirection: "row", alignItems: "flex-end", borderWidth: 1, borderRadius: radius.control, paddingLeft: 4, paddingRight: 4 },
  iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  micStop: { width: 16, height: 16, borderRadius: 3 },
  badge: { position: "absolute", top: 6, right: 4, minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 4, alignItems: "center", justifyContent: "center" },
  badgeText: { fontSize: 10, fontWeight: "700" },
  input: { flex: 1, minHeight: 44, paddingVertical: 10, paddingHorizontal: 4 },
  /* The filled circle is 36 for the look; the finger gets the 44 of `iconBtn` around it, because margin is not touchable (F322). */
  sendDot: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
});
