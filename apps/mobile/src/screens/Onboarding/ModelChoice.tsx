import { useMemo, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { formatModelBytes, type CatalogModel } from "@inborn/core";
import { joinList } from "@inborn/i18n";
import { Icon } from "@inborn/ui";

import { useTheme } from "../../services/theme";
import { useAppServices } from "../../services/AppServices";
import { Screen } from "../../components/shell/Screen";
import { Button, DISABLED_OPACITY, MonoLabel, shellStyles, Toggle } from "../../components/shell/primitives";
import { ChipGlyph } from "../../components/shell/ChipGlyph";
import { useVault } from "../../vault";
import { useEntitlement } from "../../licence";
import { modelCopy } from "../../lib/models";
import { roomNoteParams } from "../../lib/modelSheetLines";
import { languagesLine, modelStep, sourceKey, type ModelOption } from "./modelStep";
import { webChooseModel, webStepModels } from "./webStep";
import { catalogFailed } from "./catalogError";
import { font, useType } from "../../services/type";

const PLATFORM = Platform.OS === "android" ? "android" : Platform.OS === "ios" ? "ios" : "web";

/**
 * S02: the choice between the models, made before a byte moves and only between models this screen can actually deliver
 * (F120: the old step offered a Fast download it had no way to start, and offered it after the first pack had landed).
 */
export function ModelChoice() {
  const type = useType();
  const { t, i18n } = useTranslation();
  const { theme } = useTheme();
  const router = useRouter();
  const { prefs, updatePrefs, engine } = useAppServices();
  /* Subscribed to the vault: a pack landing or a download ticking repaints these cards while the step is up (B16). */
  const { vault, entries } = useVault();
  const { tier } = useEntitlement();
  const [picked, setPicked] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  /* On the browser tier the offer is the web boot's list, not the vault's: same data the door and the vault read (F312). */
  /* One read per page load: the web boot's list cannot change while the page lives (a pick reloads it). */
  const web = useMemo(() => webStepModels(), []);
  const stepEntries = web?.entries ?? entries;
  const step = useMemo(
    () =>
      modelStep({
        platform: PLATFORM,
        entries: stepEntries,
        recommendedId: web ? web.recommendedId : vault.recommendedId(),
        engineModelId: engine.model.id === "null" ? null : engine.model.id,
        freeBytes: vault.freeDiskBytes(),
        ramGB: web ? web.ramGB : vault.device.ramGB,
        languageCode: i18n.language.split("-")[0] ?? null,
        pro: tier !== "free",
      }),
    [stepEntries, web, vault, engine.model.id, i18n.language, tier],
  );

  const roomNoteNow = useMemo(() => (web ? web.roomNote : vault.recommendedRoomNote()), [web, vault, entries]);
  const noCatalog = step.options.length === 0 && catalogFailed();
  const selectedId = picked ?? step.initialSelection;
  const selected = step.options.find((o) => o.id === selectedId) ?? null;
  const modelOf = (id: string) => stepEntries.find((e) => e.model.id === id)!.model;

  const download = async (id: string) => {
    setFailed(false);
    /* The browser holds one model, so switching means the door downloads the new one; that is where the chat root leads. */
    if (web) return webChooseModel(id);
    /* Chosen now, so the model takes over the moment it verifies, whether that is on this screen or in the chat. */
    vault.setDefault(id);
    const end = await vault.install(id);
    if (end.kind !== "ready" && end.kind !== "delivering" && end.kind !== "verifying") setFailed(true);
  };

  const start = () => {
    if (selected?.state.kind === "ready") vault.setDefault(selected.id);
    router.push("/onboarding/sealed");
  };

  return (
    <Screen
      header={{ back: true }}
      mesh
      card
      testID="onboarding-model"
      footer={
        <>
          {selected?.state.kind === "download" ? (
            <Button
              testID="download-model"
              title={t("onboarding.model.download", { name: modelOf(selected.id).name, size: formatModelBytes(selected.bytes) })}
              onPress={() => void download(selected.id)}
            />
          ) : (
            <Button
              testID="start-chatting"
              title={selected?.state.kind === "arriving" ? t("onboarding.model.startWhileDownloading") : t("onboarding.model.start")}
              onPress={start}
              disabled={!step.usableNow}
            />
          )}
          {selected?.state.kind === "arriving" ? (
            <Button testID="cancel-download" title={t("onboarding.model.cancelDownload")} variant="link" onPress={() => void vault.cancel(selected.id)} />
          ) : null}
        </>
      }
    >
      {/* A step that renders one card is not a choice: on the browser tier it says whose model it is (QA F244). */}
      <Text accessibilityRole="header" style={[type.title, { color: theme.text }]}>
        {t(step.options.length > 1 ? "onboarding.model.title" : "onboarding.model.titleOne")}
      </Text>
      <Text style={[type.bodySmall, { color: theme.text2 }]}>{t("onboarding.model.sub")}</Text>
      {roomNoteNow ? (
        <Text testID="room-note" style={[type.bodySmall, { color: theme.text2 }]}>
          {t("models.roomNote", roomNoteParams(roomNoteNow))}
        </Text>
      ) : null}

      <View testID="model-options" style={styles.options}>
        {step.options.map((option) => (
          <OptionCard key={option.id} option={option} model={modelOf(option.id)} selected={option.id === selectedId} onSelect={() => setPicked(option.id)} />
        ))}
        {step.options.length === 0 ? (
          /* A catalog that never loaded is not a device with no model: the reader is told what failed, and can retry (B1). */
          <View testID="model-none-card" style={[shellStyles.card, { borderColor: theme.border, backgroundColor: theme.surface1 }]}>
            <Text style={[type.heading, { color: theme.text }]}>{t(noCatalog ? "web.catalog.title" : "onboarding.model.none")}</Text>
            <Text style={[type.bodySmall, { color: theme.text2 }]}>{t(noCatalog ? "web.catalog.explain" : "onboarding.model.noneLine")}</Text>
            {noCatalog ? <Button testID="catalog-retry" title={t("web.catalog.retry")} onPress={() => location.reload()} /> : null}
          </View>
        ) : null}
      </View>

      {step.showPlayNotice ? (
        <Text testID="play-notice" style={[type.bodySmall, { color: theme.text2 }]}>
          {t("onboarding.model.noInternet")}
        </Text>
      ) : null}
      {failed ? (
        <Text testID="download-failed" style={[type.bodySmall, { color: theme.danger }]}>
          {t("onboarding.model.downloadFailed")}
        </Text>
      ) : null}

      {/* Its own block, not a row inside the offer card: the switch governs every download, not the card it used to sit in. */}
      {step.showWifiOnly ? (
        <View testID="wifi-only-block" style={[shellStyles.well, styles.wifi, { borderColor: theme.border, backgroundColor: theme.surface1 }]}>
          <View style={styles.wifiRow}>
            <Text style={[type.body, styles.grow, { color: theme.text }]}>{t("onboarding.model.wifiOnly")}</Text>
            <Toggle testID="wifi-only" value={prefs.wifiOnly} onChange={(v) => updatePrefs({ wifiOnly: v })} label={t("onboarding.model.wifiOnly")} />
          </View>
          <Text style={[styles.note, { color: theme.text3 }]}>{t("onboarding.model.wifiOnlyHint")}</Text>
        </View>
      ) : null}

      {/* The desktop shell has no vault screen of its own to promise; the browser tier now switches in its vault (F312). */}
      {PLATFORM === "web" && !web ? null : <Text style={[styles.note, { color: theme.text3 }]}>{t("onboarding.model.laterInVault")}</Text>}
    </Screen>
  );
}

function OptionCard({ option, model, selected, onSelect }: { option: ModelOption; model: CatalogModel; selected: boolean; onSelect: () => void }) {
  const type = useType();
  const { t, i18n } = useTranslation();
  const { theme } = useTheme();
  const state = option.state;
  const blocked = state.kind === "no-space" || state.kind === "failed";
  const size = formatModelBytes(option.bytes);
  const names = languagesLine(option.languages.map((c) => t(`language.${c}`, { defaultValue: c })));
  const languages = names.more
    ? t("onboarding.model.languagesMore", { list: joinList(i18n.language, names.list), count: names.more })
    : t("onboarding.model.languages", { list: joinList(i18n.language, names.list) });

  return (
    <Pressable
      testID={`model-option-${option.id}`}
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled: blocked }}
      disabled={blocked}
      onPress={onSelect}
      style={[shellStyles.card, { borderColor: selected ? theme.text : theme.border, backgroundColor: theme.surface1, opacity: blocked ? DISABLED_OPACITY : 1 }]}
    >
      <View style={styles.head}>
        <ChipGlyph size={16} color={theme.text} />
        <Text style={[type.heading, styles.grow, { color: theme.text }]}>{model.name}</Text>
        {selected ? <Icon name="check" size={18} color={theme.sealed} /> : null}
      </View>
      <View style={styles.badges}>
        {state.kind === "ready" ? <MonoLabel color={theme.sealed}>{t("onboarding.model.readyNow")}</MonoLabel> : null}
        {option.recommended ? <MonoLabel>{t("models.recommended")}</MonoLabel> : null}
        {option.betterInLanguage ? (
          <MonoLabel color={theme.accent}>{t("onboarding.model.betterIn", { language: t(`language.${option.betterInLanguage}`, { defaultValue: option.betterInLanguage }) })}</MonoLabel>
        ) : null}
      </View>
      <MonoLabel testID={`model-source-${option.id}`}>{t(sourceKey(state), { size, host: "host" in state ? state.host : "" })}</MonoLabel>
      <Text style={[type.bodySmall, { color: theme.text2 }]}>{modelCopy(t, model, { photos: Platform.OS !== "web" }).goodFor}</Text>
      <Text style={[type.bodySmall, { color: theme.text3 }]}>{languages}</Text>
      {state.kind === "arriving" ? <Progress percent={state.percent} verifying={state.verifying} /> : null}
      {state.kind === "no-space" ? (
        <Text testID={`model-nospace-${option.id}`} style={[type.bodySmall, { color: theme.danger }]}>
          {t("vault.state.needsSpace", { size: formatModelBytes(state.freeUpBytes) })}
        </Text>
      ) : null}
    </Pressable>
  );
}

function Progress({ percent, verifying }: { percent: number; verifying: boolean }) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  return (
    <View style={styles.progress}>
      <View style={[styles.track, { backgroundColor: theme.well }]}>
        <View testID="model-progress" style={[styles.fill, { width: `${percent}%`, backgroundColor: theme.sealed }]} />
      </View>
      <MonoLabel>{verifying ? t("vault.state.verifying") : `${percent}%`}</MonoLabel>
    </View>
  );
}

const styles = StyleSheet.create({
  options: { gap: 12, paddingTop: 4 },
  head: { flexDirection: "row", alignItems: "center", gap: 8 },
  badges: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 10 },
  grow: { flex: 1 },
  wifi: { gap: 8 },
  wifiRow: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 44 },
  note: { ...font("sans"), fontSize: 12, lineHeight: 16 },
  progress: { gap: 6, paddingTop: 4 },
  track: { height: 6, borderRadius: 3, overflow: "hidden" },
  fill: { height: 6 },
});
