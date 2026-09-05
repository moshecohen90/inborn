import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import type { ChatMessage } from "@inborn/core";
import { useTheme } from "../../lib/theme";
import { modelLabel } from "../../lib/models";
import { type } from "./styles";

interface LedgerProps {
  message: ChatMessage;
  nCtx: number;
  /** Quantisation / description from the engine when it reports one. */
  quant?: string;
}

/** The receipt under every answer (§9.5 motif 4): model, quantisation, context, ms/token, generation time. Collapsed by default. */
export function Ledger({ message, nCtx, quant }: LedgerProps) {
  const theme = useTheme();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const u = message.usage;
  const msPerToken = u && u.tokPerSec > 0 ? Math.round(1000 / u.tokPerSec) : undefined;
  const genMs = u ? Math.round(u.ttftMs + (u.completionTokens * 1000) / Math.max(1, u.tokPerSec)) : undefined;
  const rows: [string, string][] = [
    [t("ledger.model"), modelLabel(message.modelId ?? "")],
    [t("ledger.quant"), quant ?? "—"],
    [t("ledger.context"), u ? `${u.promptTokens + u.completionTokens} / ${nCtx}` : "—"],
    [t("ledger.msPerToken"), msPerToken !== undefined ? `${msPerToken} ms` : "—"],
    [t("ledger.tokPerSec"), u ? u.tokPerSec.toFixed(1) : "—"],
    [t("ledger.ttft"), u ? `${Math.round(u.ttftMs)} ms` : "—"],
    [t("ledger.tokens"), u ? `${u.promptTokens} + ${u.completionTokens}` : "—"],
    [t("ledger.time"), genMs !== undefined ? `${(genMs / 1000).toFixed(1)} s` : "—"],
  ];
  return (
    <View>
      <Pressable testID="ledger-toggle" accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen((o) => !o)} hitSlop={6} style={styles.toggle}>
        <Text style={[type.monoLabel, { color: theme.text3 }]}>
          {open ? "▾" : "▸"} {t("ledger.title")}
        </Text>
      </Pressable>
      {open ? (
        <View testID="ledger" style={[styles.receipt, { borderColor: theme.border }]}>
          {rows.map(([k, v]) => (
            <View key={k} style={styles.row}>
              <Text style={[type.monoLabel, { color: theme.text3 }]}>{k}</Text>
              <Text style={[type.mono, { color: theme.text2 }]}>{v}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  toggle: { minHeight: 28, justifyContent: "center", alignSelf: "flex-start" },
  receipt: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8, gap: 4, marginTop: 2 },
  row: { flexDirection: "row", justifyContent: "space-between", gap: 12, flexWrap: "wrap" },
});
