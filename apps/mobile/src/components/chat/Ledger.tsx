import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { FREE_LEDGER_ROWS, type ChatMessage } from "@inborn/core";
import { useEntitlement } from "../../licence";
import { useTheme } from "../../lib/theme";
import { modelLabel } from "../../lib/models";
import { useType } from "../../services/type";
import { Icon } from "@inborn/ui";

interface LedgerProps {
  message: ChatMessage;
  nCtx: number;
  /** Quantisation / description from the engine when it reports one. */
  quant?: string;
  /** The paywall for the Pro "detailed statistics" row of §7.8. */
  onUnlock?: () => void;
  /** The answer above it is right-to-left, so the disclosure and its rows mirror with it (QA F234). */
  rtl?: boolean;
}

/**
 * The receipt under every answer (§9.5 motif 4). §7.1 gives Free the four rows it names — model, quantisation,
 * context, ms/token — and §7.8 sells the rest as "detailed statistics".
 */
export function Ledger({ message, nCtx, quant, onUnlock, rtl }: LedgerProps) {
  const type = useType();
  const theme = useTheme();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { can } = useEntitlement();
  const detailed = can("detailedStats");
  const u = message.usage;
  const msPerToken = u && u.tokPerSec > 0 ? Math.round(1000 / u.tokPerSec) : undefined;
  const genMs = u ? Math.round(u.ttftMs + (u.completionTokens * 1000) / Math.max(1, u.tokPerSec)) : undefined;
  const rows: [string, string, string][] = [
    ["model", t("ledger.model"), modelLabel(message.modelId ?? "")],
    ["quant", t("ledger.quant"), quant ?? "—"],
    ["context", t("ledger.context"), u ? `${u.promptTokens + u.completionTokens} / ${nCtx}` : "—"],
    ["msPerToken", t("ledger.msPerToken"), msPerToken !== undefined ? `${msPerToken} ms` : "—"],
    ["tokPerSec", t("ledger.tokPerSec"), u ? u.tokPerSec.toFixed(1) : "—"],
    ["ttft", t("ledger.ttft"), u ? `${Math.round(u.ttftMs)} ms` : "—"],
    ["tokens", t("ledger.tokens"), u ? `${u.promptTokens} + ${u.completionTokens}` : "—"],
    ["time", t("ledger.time"), genMs !== undefined ? `${(genMs / 1000).toFixed(1)} s` : "—"],
  ];
  /* F50: the family-safe row is appended after the §7.1 filter, never inside it — why an answer is not the
     model's own text is not a statistic, and a Free user has the same right to know it. */
  const shown = detailed ? [...rows] : rows.filter(([id]) => FREE_LEDGER_ROWS.includes(id));
  if (message.safety === "family-safe") shown.push(["safety", t("ledger.safety"), t("ledger.safety.familySafe")]);
  return (
    <View>
      <Pressable testID="ledger-toggle" accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen((o) => !o)} hitSlop={6} style={[styles.toggle, rtl ? styles.toggleRtl : null]}>
        <Icon name={open ? "chevronDown" : "chevronRight"} size={14} color={theme.text3} />
        <Text style={[type.monoLabel, { color: theme.text3 }]}>{t("ledger.title")}</Text>
      </Pressable>
      {open ? (
        <View testID="ledger" style={[styles.receipt, { borderColor: theme.border }]}>
          {shown.map(([id, k, v]) => (
            <View key={id} style={[styles.row, rtl ? styles.rowRtl : null]}>
              <Text style={[type.monoLabel, { color: theme.text3 }]}>{k}</Text>
              <Text testID={`ledger-${id}`} style={[type.mono, { color: theme.text2 }]}>
                {v}
              </Text>
            </View>
          ))}
          {detailed ? null : (
            <Pressable testID="ledger-detail-pro" accessibilityRole="button" onPress={onUnlock} style={[styles.row, rtl ? styles.rowRtl : null]}>
              <Text style={[type.monoLabel, { color: theme.accent }]}>{t("ledger.detailedPro")}</Text>
            </Pressable>
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  toggle: { minHeight: 28, flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start" },
  toggleRtl: { flexDirection: "row-reverse", alignSelf: "flex-end" },
  rowRtl: { flexDirection: "row-reverse" },
  receipt: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8, gap: 4, marginTop: 2 },
  row: { flexDirection: "row", justifyContent: "space-between", gap: 12, flexWrap: "wrap" },
});
