import { useState } from "react";
import { modelName } from "../../lib/models";
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { radius, type Theme } from "@inborn/ui";
import { joinList } from "@inborn/i18n";
import { GlassFill, panelColor, panelStyle } from "../../components/shell/NativeChrome";
import { BENCH_PP, benchmarkVerdict, deliverySources, distinctLanguageCodes, formatModelBytes, ttftForPrompt, type BenchmarkResult, type CatalogModel, type InstallState, type SpeedRange } from "@inborn/core";
import { deviceNoun } from "../../lib/deviceNoun";
import { font, useType } from "../../services/type";
import { useOpenSheet } from "../../lib/openSheets";
import { LicenceSheet } from "../../components/LicenceSheet";
import { licenceSubjectFor } from "../../lib/modelLicence";

export interface ModelDetailsProps {
  model: CatalogModel | null;
  state: InstallState;
  theme: Theme;
  active: boolean;
  isDefault: boolean;
  onClose: () => void;
  onSetDefault: () => void;
  onDelete: () => void;
  /** S31 "Benchmark on this phone": last stored result, the §6.4 expectation for this chip, and the action (absent where the engine cannot bench). */
  benchmark?: BenchmarkResult | null;
  expected?: SpeedRange;
  benchmarking?: boolean;
  onBenchmark?: () => void;
}

const seconds = (ms: number): string => `${(ms / 1000).toFixed(ms >= 10_000 ? 0 : 1)} s`;
const tps = (v: number): string => (v >= 100 ? String(Math.round(v)) : v.toFixed(1));

/** S31: everything about one model (spec §8.4). Numbers live here, not on the cartridge. */
export function ModelDetails({ model, state, theme, active, isDefault, onClose, onSetDefault, onDelete, benchmark = null, expected, benchmarking = false, onBenchmark }: ModelDetailsProps) {
  const type = useType();
  const { t, i18n } = useTranslation();
  const installed = state.kind === "ready" || state.kind === "quarantined";
  const device = deviceNoun();
  const join = (items: readonly string[]) => joinList(i18n.language, items);
  const rows: [string, string][] = model
    ? [
        [t("vault.details.params"), model.params || "—"],
        [t("vault.details.quant"), model.quant || "—"],
        [t("vault.details.context"), model.contextLength ? t("vault.details.tokens", { count: model.contextLength }) : "—"],
        [t("vault.details.vision"), t(model.vision ? "vault.yes" : "vault.no")],
        [t("vault.details.tools"), t(model.tools ? "vault.yes" : "vault.no")],
        [t("vault.details.languages"), model.fit ? join(distinctLanguageCodes(model.fit.languages).map((c) => `${t(`language.${c}`, { defaultValue: c })} (${t(`vault.fit.tier.${model.fit!.languages[c]!}`)})`)) : model.goodLanguages.length ? join(model.goodLanguages) : "—"],
        [t("vault.details.license"), model.license],
        [t("vault.details.source"), installed ? t(`vault.source.${state.via}`) : join(deliverySources(model, Platform.OS).map((v) => t(`vault.source.${v}`)))],
        [t("vault.details.sha"), installed ? state.sha256 : model.sha256],
        ...(installed ? [[t("vault.details.path"), state.path] as [string, string]] : []),
        ...(state.kind === "failed" && state.error !== "no-delivery" ? [[t("vault.details.error"), state.error] as [string, string]] : []),
      ]
    : [];
  const verdict = benchmark ? benchmarkVerdict(benchmark.genTokPerSec, expected) : "unknown";
  const ttft = benchmark ? ttftForPrompt(benchmark.promptTokPerSec, benchmark.pp) : null;
  const measured = (at: number): string => {
    try {
      return new Intl.DateTimeFormat(i18n.language, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(at));
    } catch {
      return new Date(at).toLocaleString();
    }
  };
  /* F54: the licence row named a licence nobody could read; the text now ships with the app (§11.4). */
  const [licenceOpen, setLicenceOpen] = useState(false);
  useOpenSheet(model !== null, onClose);
  return (
    <Modal visible={model !== null} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, panelStyle, { backgroundColor: panelColor(theme.surface1), borderColor: theme.border }]}>
        <GlassFill />
        <Text style={[type.title, { color: theme.text }]}>
          {model ? modelName(t, model) : ""} · {model?.family} {model?.params}
        </Text>
        <Text style={[type.mono, { color: theme.text3 }]}>
          {model ? formatModelBytes(model.bytes) : ""} · {model?.arch}
        </Text>
        <ScrollView style={styles.table} contentContainerStyle={{ gap: 8 }}>
          {rows.map(([k, v]) => (
            <View key={k} style={styles.row}>
              <Text style={[type.mono, type.monoLabel, { color: theme.text3 }]}>{k.toUpperCase()}</Text>
              <Text selectable style={[type.mono, { color: theme.text }]}>
                {v}
              </Text>
            </View>
          ))}
          {model ? (
            <Pressable testID="details-view-licence" accessibilityRole="button" hitSlop={6} onPress={() => setLicenceOpen(true)} style={styles.licenceBtn}>
              <Text style={[type.body, styles.body, { color: theme.accent }]}>{t("licenses.view")}</Text>
            </Pressable>
          ) : null}
          {installed && model?.role === "chat" && onBenchmark ? (
            <View testID="details-benchmark" style={[styles.bench, { borderColor: theme.border }]}>
              <Text style={[type.mono, type.monoLabel, { color: theme.text3 }]}>{t("vault.benchmark.title").toUpperCase()}</Text>
              {benchmark ? (
                <>
                  <Text testID="benchmark-result" selectable style={[type.mono, { color: theme.text }]}>
                    {t("vault.benchmark.result", { load: seconds(benchmark.loadMs), prompt: tps(benchmark.promptTokPerSec), gen: tps(benchmark.genTokPerSec) })}
                  </Text>
                  {ttft !== null ? <Text style={[type.mono, { color: theme.text2 }]}>{t("vault.benchmark.ttft", { tokens: BENCH_PP, ttft: seconds(ttft) })}</Text> : null}
                  {benchmark.memMB !== null ? <Text style={[type.mono, { color: theme.text2 }]}>{t("vault.benchmark.memory", { size: formatModelBytes(benchmark.memMB * 1048576) })}</Text> : null}
                  {expected ? (
                    <Text testID="benchmark-verdict" style={[type.mono, { color: verdict === "slower" ? theme.accent : theme.text2 }]}>
                      {t("vault.benchmark.expected", { min: expected[0], max: expected[1], device })}
                      {verdict !== "unknown" ? ` · ${t(`vault.benchmark.verdict.${verdict}`)}` : ""}
                    </Text>
                  ) : null}
                  <Text style={[type.mono, { color: theme.text3 }]}>{t("vault.benchmark.measured", { when: measured(benchmark.at) })}</Text>
                </>
              ) : (
                <Text style={[type.mono, { color: theme.text2 }]}>{t("vault.benchmark.none")}</Text>
              )}
              <Pressable testID="details-benchmark-run" accessibilityRole="button" disabled={benchmarking} onPress={onBenchmark} style={[styles.benchBtn, { borderColor: theme.border, backgroundColor: theme.surface2, opacity: benchmarking ? 0.6 : 1 }]}>
                {benchmarking ? <ActivityIndicator size="small" color={theme.text2} /> : null}
                <Text style={[type.body, styles.body, { color: theme.text }]}>{benchmarking ? t("vault.benchmark.running") : t(benchmark ? "vault.benchmark.again" : "vault.benchmark.run", { device })}</Text>
              </Pressable>
            </View>
          ) : null}
        </ScrollView>
        <View style={styles.actions}>
          {installed && !isDefault && model?.role === "chat" ? (
            <Pressable testID="details-set-default" accessibilityRole="button" onPress={onSetDefault} style={[styles.cta, { backgroundColor: theme.ctaFill }]}>
              <Text style={[type.body, styles.body, { color: theme.ctaText }]}>{t("vault.details.setDefault")}</Text>
            </Pressable>
          ) : null}
          {installed ? (
            state.via === "bundled" ? (
              <Text style={[type.mono, { color: theme.text3 }]}>{t("vault.state.bundled")}</Text>
            ) : active ? (
              <Text style={[type.mono, { color: theme.text3 }]}>{t("vault.details.deleteBlocked")}</Text>
            ) : (
              <Pressable testID="details-delete" accessibilityRole="button" onPress={onDelete} style={styles.textBtn}>
                <Text style={[type.body, styles.body, { color: theme.danger }]}>{t("vault.remove")}</Text>
              </Pressable>
            )
          ) : null}
          <Pressable accessibilityRole="button" onPress={onClose} style={styles.textBtn}>
            <Text style={[type.body, styles.body, { color: theme.text2 }]}>{t("vault.close")}</Text>
          </Pressable>
        </View>
      </View>
      <LicenceSheet visible={licenceOpen} subject={model ? licenceSubjectFor(model) : null} onClose={() => setLicenceOpen(false)} />
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.45)" },
  sheet: { position: "absolute", left: 0, right: 0, bottom: 0, maxHeight: "80%", padding: 20, paddingBottom: 32, gap: 10, borderTopWidth: 1, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  table: { flexGrow: 0 },
  row: { gap: 2 },
  bench: { gap: 6, paddingTop: 12, marginTop: 4, borderTopWidth: StyleSheet.hairlineWidth },
  licenceBtn: { minHeight: 44, justifyContent: "center", alignSelf: "flex-start" },
  benchBtn: { minHeight: 44, marginTop: 4, paddingHorizontal: 16, borderRadius: radius.control, borderWidth: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  body: { ...font("sans", "500") },
  actions: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "flex-end", gap: 8 },
  cta: { minHeight: 44, paddingHorizontal: 16, borderRadius: radius.control, alignItems: "center", justifyContent: "center" },
  textBtn: { minHeight: 44, paddingHorizontal: 12, justifyContent: "center" },
});
