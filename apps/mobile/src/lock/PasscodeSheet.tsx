import { useEffect, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import { isValidPasscode, PASSCODE_MAX } from "@inborn/core";
import { radius } from "@inborn/ui";
import { useTheme } from "../services/theme";
import { Sheet } from "../components/shell/Sheet";
import { Button } from "../components/shell/primitives";
import { font } from "../services/type";

interface Props {
  visible: boolean;
  mode: "set" | "verify";
  onClose: () => void;
  onSubmit: (code: string) => Promise<boolean>;
  /** Shown under the field, e.g. "2 attempts left before wipe". */
  warning?: string | null;
}

/** Digits only, 4–8 (S53 fallback). "set" asks twice; "verify" reports a wrong code without saying which digit. */
export function PasscodeSheet({ visible, mode, onClose, onSubmit, warning }: Props) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const [first, setFirst] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) {
      setFirst(null);
      setCode("");
      setError(null);
    }
  }, [visible]);

  const submit = async () => {
    if (!isValidPasscode(code)) {
      setError(t("passcode.invalid"));
      return;
    }
    if (mode === "set" && first === null) {
      setFirst(code);
      setCode("");
      setError(null);
      return;
    }
    if (mode === "set" && first !== code) {
      setFirst(null);
      setCode("");
      setError(t("passcode.mismatch"));
      return;
    }
    let ok: boolean;
    try {
      ok = await onSubmit(code);
    } catch (e: unknown) {
      setCode("");
      setError(t("passcode.saveFailed", { error: e instanceof Error ? e.message : String(e) }));
      return;
    }
    if (!ok) {
      setCode("");
      setError(t("passcode.wrong"));
    }
  };

  const title = mode === "verify" ? t("passcode.enter") : first === null ? t("passcode.choose") : t("passcode.confirm");
  return (
    <Sheet visible={visible} onClose={onClose} title={title} testID="passcode-sheet">
      <TextInput
        testID="passcode-input"
        value={code}
        onChangeText={(v) => setCode(v.replace(/\D/g, "").slice(0, PASSCODE_MAX))}
        keyboardType="number-pad"
        secureTextEntry
        autoFocus
        maxLength={PASSCODE_MAX}
        onSubmitEditing={() => void submit()}
        accessibilityLabel={title}
        style={[styles.input, { color: theme.text, backgroundColor: theme.well, borderColor: theme.border }]}
      />
      {error ? <Text style={[styles.hint, { color: theme.danger }]}>{error}</Text> : <Text style={[styles.hint, { color: theme.text3 }]}>{t("passcode.hint")}</Text>}
      {warning ? <Text style={[styles.hint, { color: theme.danger }]}>{warning}</Text> : null}
      <View style={styles.actions}>
        <Button title={t("chats.cancel")} variant="link" onPress={onClose} />
        <Button testID="passcode-submit" title={mode === "verify" ? t("lock.unlock") : t("chats.save")} onPress={() => void submit()} style={styles.grow} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  input: { minHeight: 52, borderWidth: 1, borderRadius: radius.control, paddingHorizontal: 16, ...font("mono"), fontSize: 24, letterSpacing: 8, textAlign: "center" },
  hint: { ...font("sans"), fontSize: 13, lineHeight: 18 },
  actions: { flexDirection: "row", gap: 8, alignItems: "center" },
  grow: { flex: 1 },
});
