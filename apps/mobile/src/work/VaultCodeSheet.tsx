import { useEffect, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import { PASSCODE_MAX, isValidPasscode } from "@inborn/core";
import { useTheme } from "../lib/theme";
import { Sheet } from "../components/chat/Sheet";
import { shape } from "../components/chat/styles";
import { useType } from "../services/type";
import { Button } from "../components/shell/primitives";

export type VaultCodeMode = { kind: "set"; folderName: string } | { kind: "verify"; folderName: string } | { kind: "change"; folderName: string };

interface Props {
  mode: VaultCodeMode | null;
  onClose: () => void;
  /** Resolves false to show "wrong passcode" (verify) and keep the sheet open. */
  onSubmit: (code: string) => Promise<boolean>;
}

/** The vault's own passcode (S53 rules: digits, 4–8). "set"/"change" ask twice; "verify" never says which digit was wrong. */
export function VaultCodeSheet({ mode, onClose, onSubmit }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const type = useType();
  const [code, setCode] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const asking = mode?.kind === "set" || mode?.kind === "change";
  useEffect(() => {
    setCode("");
    setRepeat("");
    setError(null);
  }, [mode]);

  const submit = async () => {
    if (!isValidPasscode(code)) return setError(t("passcode.invalid"));
    if (asking && code !== repeat) return setError(t("passcode.mismatch"));
    setBusy(true);
    try {
      const ok = await onSubmit(code);
      if (!ok) {
        setError(t("vaults.wrongCode"));
        setCode("");
      }
    } finally {
      setBusy(false);
    }
  };
  const field = [shape.field, { backgroundColor: theme.well, borderColor: theme.border, color: theme.text }];
  const title = mode?.kind === "set" ? t("vaults.setCode") : mode?.kind === "change" ? t("vaults.changeCode") : t("vaults.enterCode");
  return (
    <Sheet visible={mode !== null} onClose={onClose} title={title} testID="vault-code-sheet" scroll={false}>
      <View style={styles.body}>
        <Text style={[type.bodySmall, { color: theme.text2 }]}>{mode?.folderName}</Text>
        <TextInput testID="vault-code" autoFocus value={code} onChangeText={(v) => setCode(v.replace(/\D/g, "").slice(0, PASSCODE_MAX))} keyboardType="number-pad" secureTextEntry maxLength={PASSCODE_MAX} placeholder={t("passcode.enter")} placeholderTextColor={theme.text3} onSubmitEditing={() => (asking ? undefined : void submit())} style={field} />
        {asking ? <TextInput testID="vault-code-repeat" value={repeat} onChangeText={(v) => setRepeat(v.replace(/\D/g, "").slice(0, PASSCODE_MAX))} keyboardType="number-pad" secureTextEntry maxLength={PASSCODE_MAX} placeholder={t("passcode.confirm")} placeholderTextColor={theme.text3} onSubmitEditing={() => void submit()} style={field} /> : null}
        {error ? (
          <Text testID="vault-code-error" style={[type.caption, { color: theme.danger }]}>
            {error}
          </Text>
        ) : null}
        <Button testID="vault-code-submit" title={mode?.kind === "verify" ? t("vaults.unlock") : t("chats.save")} onPress={() => void submit()} disabled={busy || !code} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({ body: { paddingHorizontal: 12, paddingVertical: 8, gap: 10 } });
