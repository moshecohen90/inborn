import { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import { verificationInstructions, verifyRecord, type RecordVerdict } from "@inborn/core";
import { useTheme } from "../../services/theme";
import { Screen } from "../../components/shell/Screen";
import { Actions, Button, Mono } from "../../components/shell/primitives";
import { Markdown } from "../../components/chat/Markdown";
import { shape } from "../../components/chat/styles";
import { useType } from "../../services/type";
import { useWork } from "../../work";
import { chooseFile } from "../../documents/chooseFile";

/** Settings → Pro for Work → Verify a signed record: hash + Ed25519 check of a `.json` record, no network (§7.5 Work). Free for everyone: verification must never be gated. */
export function VerifyRecord() {
  const { t, i18n } = useTranslation();
  const { theme } = useTheme();
  const type = useType();
  const { work } = useWork();
  const [pasted, setPasted] = useState("");
  const [verdict, setVerdict] = useState<{ v: RecordVerdict; mine: boolean } | null>(null);

  const check = async (text: string) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
    const v = verifyRecord(parsed);
    const mine = v.ok ? (await work.publicKeyIfAny()) === v.publicKeyHex : false;
    setVerdict({ v, mine });
  };
  const pick = async () => {
    try {
      const picked = await chooseFile();
      if (picked) await check(await picked.text());
    } catch (e: unknown) {
      console.warn("[work] pick record", e);
    }
  };
  const when = (ms: number) => new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium", timeStyle: "short" }).format(new Date(ms));

  return (
    <Screen header={{ back: true, title: t("verify.title") }} testID="verify-record">
      <Actions>
        <Button testID="verify-pick" title={t("verify.pick")} onPress={() => void pick()} />
      </Actions>
      <Text style={[type.bodySmall, styles.label, { color: theme.text2 }]}>{t("verify.paste")}</Text>
      <TextInput testID="verify-input" value={pasted} onChangeText={setPasted} multiline autoCapitalize="none" autoCorrect={false} placeholder="{ … }" placeholderTextColor={theme.text3} style={[shape.field, styles.input, { backgroundColor: theme.well, borderColor: theme.border, color: theme.text }]} />
      <Actions>
        <Button testID="verify-run" title={t("verify.run")} variant="secondary" disabled={!pasted.trim()} onPress={() => void check(pasted)} />
      </Actions>
      {verdict ? (
        <View testID="verify-result" style={[styles.result, { borderColor: verdict.v.ok ? theme.sealed : theme.danger, backgroundColor: theme.surface1 }]}>
          <Mono color={verdict.v.ok ? theme.sealed : theme.danger}>{verdict.v.ok ? t("verify.valid", { count: verdict.v.messages, date: when(verdict.v.exportedAt) }) : t(`verify.invalid.${verdict.v.reason}`)}</Mono>
          {verdict.v.ok ? <Text style={[type.caption, { color: theme.text3 }]}>{verdict.mine ? t("verify.thisDevice") : t("verify.otherDevice", { key: verdict.v.publicKeyHex.slice(0, 12) })}</Text> : null}
        </View>
      ) : null}
      <Text style={[type.monoLabel, styles.label, { color: theme.text3 }]}>{t("verify.how")}</Text>
      <Markdown testID="verify-how" source={verificationInstructions()} direction="ltr" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  label: { marginTop: 16, marginBottom: 6 },
  input: { minHeight: 120, textAlignVertical: "top", marginBottom: 8 },
  result: { marginTop: 12, padding: 12, borderWidth: 1, borderRadius: 12, gap: 4 },
});
