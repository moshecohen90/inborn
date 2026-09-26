import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { MIN_TOUCH, radius, type Theme } from "@inborn/ui";
import { downloadPercent, formatModelBytes } from "@inborn/core";
import { joinList } from "@inborn/i18n";
import { chooseWebModel, delivery, settleModelStatus, type WebBoot } from "./boot";
import { ModelOptions } from "./ModelOptions";
import { deviceNoun } from "../lib/deviceNoun";
import { languagesLine } from "../screens/Onboarding/modelStep";
import type { DeliveryEvent } from "./modelDelivery";
import { roomNoteParams } from "../lib/modelSheetLines";
import { requestPersist, spaceCheck, storageEstimate, type StorageEstimate } from "./opfs";
import { recordWebTransfer } from "./transfers";
import { font } from "../services/type";
import { installFailureText } from "../vault/failureText";

type Phase =
  | { kind: "idle" }
  | { kind: "downloading"; have: number; total: number | null }
  | { kind: "verifying"; have: number }
  | { kind: "paused"; have: number }
  | { kind: "error"; message: string };


export interface ModelOfferProps {
  boot: WebBoot;
  theme: Theme;
  /** The file is verified in OPFS, or the reader took a model this browser already holds. */
  onReady: () => void;
  /** Its own card on an empty page (the model is gone after onboarding); inside the onboarding step the step is the card. */
  framed: boolean;
  /** One line above the offer saying why it is back. */
  note?: string | null;
  /** The engine already runs without a file (Chrome's built-in model): the step may go on without a download. */
  onContinue?: () => void;
}

/**
 * The browser's model offer (spec §14.3): the recommendation and why, speed, languages, free space, the download with
 * its progress and errors, and the other models folded below. Onboarding's model step on the web renders it, and so
 * does the page a returning reader meets when the model has left this browser: one list, `WebBoot.choices` (F312).
 */
export function ModelOffer({ boot, theme, onReady, framed, note, onContinue }: ModelOfferProps) {
  const { t, i18n } = useTranslation();
  /* The pick drives the render; chooseWebModel() keeps the boot and the saved preference on the same model. */
  const [chosenId, setChosenId] = useState<string | null>(boot.source?.id ?? null);
  const [phase, setPhase] = useState<Phase>(() => (boot.status.kind === "partial" ? { kind: "paused", have: boot.status.have } : { kind: "idle" }));
  const [estimate, setEstimate] = useState<StorageEstimate | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [errorDetails, setErrorDetails] = useState(false);
  const running = useRef(false);

  useEffect(() => {
    storageEstimate().then((e) => {
      setEstimate(e);
      setPersisted(e.persisted);
    });
  }, []);

  const choice = boot.choices.find((c) => c.source.id === chosenId);
  const source = choice?.source ?? boot.source;
  if (!source) return null;
  /* The same four-names-plus-a-count line the onboarding card uses; Fast is good at nine and the list is not the point. */
  const languageNames = languagesLine((choice?.languages ?? []).map((c) => t(`language.${c}`, { defaultValue: c })));
  const speed = choice?.speed;
  const choose = async (id: string) => {
    if (running.current || !(await chooseWebModel(id))) return;
    setPhase(boot.status.kind === "partial" ? { kind: "paused", have: boot.status.have } : { kind: "idle" });
    setChosenId(id);
  };
  const have = phase.kind === "paused" || phase.kind === "downloading" ? phase.have : 0;
  const space = estimate ? spaceCheck(estimate, source.bytes, have) : null;
  const size = formatModelBytes(source.bytes);

  const start = async () => {
    if (running.current) return;
    running.current = true;
    setPersisted(await requestPersist());
    setPhase({ kind: "downloading", have, total: source.bytes });
    const onEvent = (e: DeliveryEvent) => {
      if (e.type === "progress") setPhase(e.have >= (e.total ?? source.bytes) ? { kind: "verifying", have: e.have } : { kind: "downloading", have: e.have, total: e.total });
      else if (e.type === "paused") setPhase({ kind: "paused", have: e.have });
      else if (e.type === "error") setPhase({ kind: "error", message: e.message });
    };
    const end = await delivery.download(source, onEvent);
    running.current = false;
    if (end.type === "done") {
      recordWebTransfer({ host: new URL(source.url, location.origin).host, bytesOut: 0, bytesIn: end.have, at: Date.now(), purpose: "model" });
      const status = await settleModelStatus();
      if (status.kind === "ready") onReady();
      else setPhase({ kind: "error", message: "stored file does not match" });
    }
    storageEstimate().then(setEstimate);
  };

  const busy = phase.kind === "downloading" || phase.kind === "verifying";
  const stored = phase.kind === "idle" && boot.status.kind === "ready";
  const percent = phase.kind === "downloading" ? downloadPercent(phase.have, phase.total ?? source.bytes) : phase.kind === "verifying" ? 100 : 0;
  const body = (
    <>
      {note ? (
        <Text testID="model-gone-why" style={[styles.body, { color: theme.text }]}>
          {note}
        </Text>
      ) : null}
      <Text style={[styles.monoLabel, { color: theme.sealed }]}>{t("chat.onDevice")}</Text>
      <Text style={[styles.headline, { color: theme.text }]}>{t("web.download.title", { model: source.name })}</Text>
      {/* Why this one and not another (Moshe, 24.9): the reason belongs beside the offer, above the list of the rest. */}
      {choice?.recommended ? (
        <>
          <Text style={[styles.monoLabel, { color: theme.accent }]}>{t("models.recommended", { device: deviceNoun() })}</Text>
          <Text testID="web-download-why" style={[styles.body, { color: theme.text2 }]}>
            {t("web.download.why")}
          </Text>
          {boot.roomNote ? (
            <Text testID="room-note" style={[styles.body, { color: theme.text2 }]}>
              {t("models.roomNote", roomNoteParams(boot.roomNote))}
            </Text>
          ) : null}
        </>
      ) : null}
      <Text style={[styles.body, { color: theme.text2 }]}>{t("web.download.explain", { size })}</Text>
      <Text testID="web-download-speed" style={[styles.mono, { color: theme.text3 }]}>
        {speed ? t("vault.speed", { min: speed[0], max: speed[1], device: deviceNoun() }) : t("vault.speedUnknown", { device: deviceNoun() })}
      </Text>
      {languageNames.list.length ? (
        <Text testID="web-download-languages" style={[styles.caption, { color: theme.text3 }]}>
          {languageNames.more
            ? t("onboarding.model.languagesMore", { list: joinList(i18n.language, languageNames.list), count: languageNames.more })
            : t("onboarding.model.languages", { list: joinList(i18n.language, languageNames.list) })}
        </Text>
      ) : null}
      <Text style={[styles.mono, { color: theme.text3 }]}>
        {t("web.download.storage", { free: estimate?.quota != null ? formatModelBytes(Math.max(0, estimate.quota - (estimate.usage ?? 0))) : "?" })}
        {persisted === null ? "" : ` · ${t(persisted ? "web.download.kept" : "web.download.notKept")}`}
      </Text>

      {space && !space.ok && !busy ? (
        <Text testID="no-space" style={[styles.body, { color: theme.danger }]}>
          {t("web.download.noSpace", { needed: formatModelBytes(space.needed), free: formatModelBytes(space.free) })}
        </Text>
      ) : null}
      {phase.kind === "error" ? (
        <View>
          <Text testID="download-error" style={[styles.body, { color: theme.danger }]}>
            {installFailureText(t, phase.message, "web", typeof navigator !== "undefined" && navigator.onLine === false)}
          </Text>
          <Pressable testID="download-error-details" accessibilityRole="button" onPress={() => setErrorDetails((v) => !v)} style={styles.textBtn}>
            <Text style={[styles.caption, { color: theme.text2 }]}>{t("vault.details")}</Text>
          </Pressable>
          {errorDetails ? (
            <Text testID="download-error-raw" selectable style={[styles.mono, { color: theme.text3 }]}>
              {phase.message}
            </Text>
          ) : null}
        </View>
      ) : null}

      {busy ? (
        <View style={styles.progressWrap}>
          <View style={[styles.track, { backgroundColor: theme.well }]}>
            <View style={[styles.fill, { width: `${percent}%`, backgroundColor: theme.sealed }]} />
          </View>
          <Text testID="download-progress" style={[styles.mono, { color: theme.text2 }]}>
            {phase.kind === "verifying" ? t("web.download.verifying") : t("web.download.progress", { done: formatModelBytes(phase.have), total: formatModelBytes(phase.total ?? source.bytes), percent })}
          </Text>
          {phase.kind === "downloading" ? (
            <Pressable testID="download-cancel" accessibilityRole="button" onPress={() => delivery.cancel()} style={styles.textBtn}>
              <Text style={[styles.body, { color: theme.text2 }]}>{t("web.download.cancel")}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : stored ? (
        /* Picked a model this browser already holds: nothing to download, only the reload that hands it to the engine. */
        <Pressable testID="use-model" accessibilityRole="button" onPress={onReady} style={[styles.cta, { backgroundColor: theme.ctaFill }]}>
          <Text style={[styles.body, styles.strong, { color: theme.ctaText }]}>{t("vault.use")}</Text>
        </Pressable>
      ) : (
        <Pressable
          testID={phase.kind === "paused" ? "download-resume" : "download-model"}
          accessibilityRole="button"
          disabled={!!space && !space.ok}
          onPress={() => void start()}
          style={[styles.cta, { backgroundColor: theme.ctaFill, opacity: space && !space.ok ? 0.5 : 1 }]}
        >
          <Text style={[styles.body, styles.strong, { color: theme.ctaText }]}>
            {phase.kind === "paused" ? t("web.download.resume", { done: formatModelBytes(phase.have), total: size }) : phase.kind === "error" ? t("vault.retry") : t("web.download.button", { size })}
          </Text>
        </Pressable>
      )}
      <Text style={[styles.caption, { color: theme.text3 }]}>{t("web.download.keepExplain")}</Text>
      {onContinue && !busy ? (
        <Pressable testID="start-chatting" accessibilityRole="button" onPress={onContinue} style={styles.textBtn}>
          <Text style={[styles.body, { color: theme.text2 }]}>{t("onboarding.model.start")}</Text>
        </Pressable>
      ) : null}
      <ModelOptions choices={boot.choices} currentId={source.id} onChoose={(id) => void choose(id)} theme={theme} disabled={busy} />
    </>
  );
  if (!framed) return <View testID="download-door" style={styles.inStep}>{body}</View>;
  return (
    /* The card grows when the option list opens; at 390 that is taller than the viewport, so the page scrolls. */
    <ScrollView testID="download-door" contentContainerStyle={styles.doorScroll}>
      <View style={[styles.card, { borderColor: theme.border, backgroundColor: theme.surface1 }]}>{body}</View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  doorScroll: { flexGrow: 1, alignItems: "center", justifyContent: "center", padding: 16 },
  card: { width: "100%", maxWidth: 440, padding: 20, gap: 12, borderWidth: 1, borderRadius: radius.card },
  inStep: { gap: 12 },
  headline: { ...font("sans", "600"), fontSize: 22, letterSpacing: -0.2 },
  body: { ...font("sans"), fontSize: 16, lineHeight: 22 },
  caption: { ...font("sans"), fontSize: 12, lineHeight: 16 },
  strong: { fontWeight: "600" },
  mono: { ...font("mono"), fontSize: 12, letterSpacing: 0.3 },
  monoLabel: { ...font("mono", "500"), fontSize: 11, letterSpacing: 0.9, textTransform: "uppercase" },
  cta: { minHeight: MIN_TOUCH, paddingHorizontal: 20, borderRadius: radius.control, alignItems: "center", justifyContent: "center" },
  textBtn: { minHeight: MIN_TOUCH, justifyContent: "center" },
  progressWrap: { gap: 8 },
  track: { height: 6, borderRadius: 3, overflow: "hidden" },
  fill: { height: 6 },
});
