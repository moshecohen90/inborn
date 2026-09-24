import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "expo-router";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../services/theme";
import { useTranslation } from "react-i18next";
import { Icon, MIN_TOUCH, radius, type Theme } from "@inborn/ui";
import { formatModelBytes } from "@inborn/core";
import { joinList } from "@inborn/i18n";
import { chooseWebModel, delivery, settleModelStatus, webBoot, webReady, type WebBoot } from "./boot";
import { ModelOptions } from "./ModelOptions";
import { deviceNoun } from "../lib/deviceNoun";
import { languagesLine } from "../screens/Onboarding/modelStep";
import type { DeliveryEvent } from "./modelDelivery";
import { requestPersist, spaceCheck, storageEstimate, type StorageEstimate } from "./opfs";
import { writeEnginePref } from "./prefs";
import { recordWebTransfer } from "./transfers";
import { registerServiceWorker, type OfflineState } from "./serviceWorker";
import { font } from "../services/type";
import { Toggle } from "../components/shell/primitives";
import { webDoorsApply } from "./doors";
import { needsModel } from "./doorRoutes";

import { GET_APP_URL } from "./links";

export { GET_APP_URL, STORE_LINKS } from "./links";

type Phase =
  | { kind: "idle" }
  | { kind: "downloading"; have: number; total: number | null }
  | { kind: "verifying"; have: number }
  | { kind: "paused"; have: number }
  | { kind: "error"; message: string };

/** Web doors (spec §8.9, §14.3): the notice strip, the phone door, the download door and the engine switch. */
export function WebShell({ children }: { children: ReactNode }) {
  return webDoorsApply() ? <BrowserShell>{children}</BrowserShell> : <>{children}</>;
}

function BrowserShell({ children }: { children: ReactNode }) {
  const boot = webBoot();
  const { theme } = useTheme();
  const [ready] = useState(() => webReady(boot));
  const [offline, setOffline] = useState<OfflineState>("installing");
  /* The price list, the legal texts and the proof screen answer questions the model has nothing to do with (F293). */
  const gated = needsModel(usePathname());

  useEffect(() => {
    void registerServiceWorker(setOffline);
  }, []);

  return (
    <View style={[styles.root, { backgroundColor: theme.bg }]}>
      <Strip boot={boot} theme={theme} offline={offline} />
      {/* The app services picked their engine at boot, before the file existed; a reload is the honest hand-over (same as the engine switch). */}
      {ready || !gated ? children : boot.source ? <DownloadDoor boot={boot} theme={theme} onReady={() => location.reload()} /> : <CatalogDoor theme={theme} />}
    </View>
  );
}

function Strip({ boot, theme, offline }: { boot: WebBoot; theme: Theme; offline: OfflineState }) {
  const { t } = useTranslation();
  /* Four stacked notices above an empty chat read as friction whatever each one says (Moshe, 24.9): one line, and the
     rest behind a disclosure the reader opens once. Nothing is removed, only folded. */
  const [open, setOpen] = useState(false);
  const phone = boot.gate.formFactor === "phone";
  const switchEngine = (on: boolean) => {
    writeEnginePref(on ? "chrome-nano" : "wllama");
    /* The engine is chosen once per page load (src/engine.ts caches the session); a reload is the honest switch. */
    location.reload();
  };
  return (
    <View testID="web-strip" style={[styles.strip, { backgroundColor: theme.surface1, borderColor: theme.border }]}>
      <View style={styles.stripText}>
        <View style={styles.summaryRow}>
          <Text style={[styles.caption, styles.grow, { color: theme.text2 }]}>{t("web.notice")}</Text>
          <Pressable testID="web-strip-details" accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen((o) => !o)} hitSlop={6} style={styles.detailsBtn}>
            <Icon name={open ? "chevronDown" : "chevronRight"} size={14} color={theme.text2} />
            <Text style={[styles.caption, styles.strong, { color: theme.text2 }]}>{t("web.details")}</Text>
          </Pressable>
        </View>
        {/* The phone limit is a door, not a notice: it stays out where the reader it applies to cannot miss it. */}
        {phone ? (
          <Text testID="phone-door" style={[styles.caption, { color: theme.text }]}>
            {t(boot.gate.iphone ? "web.iphoneDoor" : "web.phoneLimit")}
          </Text>
        ) : null}
        {open ? (
          <View testID="web-strip-detail" style={styles.stripDetail}>
            {boot.gate.ramGB === null && !phone ? <Text style={[styles.caption, { color: theme.text3 }]}>{t("web.unknownMemory")}</Text> : null}
            {/* §9.2/§9.3: mono and the sealed green belong to the state word alone; the caveat is a sentence, so it is body text. */}
            <Text testID="web-offline-state" style={[styles.mono, { color: offline === "ready" ? theme.sealed : theme.text3 }]}>
              {t(offline === "ready" ? "web.offlineReady" : offline === "installing" ? "web.offlinePreparing" : "web.offlineUnavailable")}
            </Text>
            <Text testID="web-storage-notice" style={[styles.caption, { color: theme.text2 }]}>
              {t("webStorageNotice")}
            </Text>
            {boot.chromePromptApi ? (
              <View style={styles.switchRow}>
                <Toggle testID="engine-switch" value={boot.engine === "chrome-nano"} onChange={switchEngine} />
                <Text style={[styles.caption, { color: theme.text }]}>{t("web.engine.chrome")}</Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
      <Pressable testID="get-app" accessibilityRole="link" onPress={() => void Linking.openURL(GET_APP_URL)} style={[styles.getApp, { borderColor: theme.border }]}>
        <Text style={[styles.caption, styles.strong, { color: theme.text }]}>{t("web.getApp")}</Text>
      </Pressable>
    </View>
  );
}

/**
 * The catalog itself did not arrive, so there is nothing to offer and nothing to blame on this browser (B1, 24.9.2026:
 * the origin served the SPA shell for /models/manifest.json and the app said "no model on this browser" forever).
 */
function CatalogDoor({ theme }: { theme: Theme }) {
  const { t } = useTranslation();
  return (
    <View testID="catalog-door" style={styles.door}>
      <View style={[styles.card, { borderColor: theme.border, backgroundColor: theme.surface1 }]}>
        <Text style={[styles.headline, { color: theme.text }]}>{t("web.catalog.title")}</Text>
        <Text style={[styles.body, { color: theme.text2 }]}>{t("web.catalog.explain")}</Text>
        <Pressable testID="catalog-retry" accessibilityRole="button" onPress={() => location.reload()} style={[styles.cta, { backgroundColor: theme.ctaFill }]}>
          <Text style={[styles.body, styles.strong, { color: theme.ctaText }]}>{t("web.catalog.retry")}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function DownloadDoor({ boot, theme, onReady }: { boot: WebBoot; theme: Theme; onReady: () => void }) {
  const { t, i18n } = useTranslation();
  /* The pick drives the render; chooseWebModel() keeps the boot and the saved preference on the same model. */
  const [chosenId, setChosenId] = useState<string | null>(boot.source?.id ?? null);
  const [phase, setPhase] = useState<Phase>(() => (boot.status.kind === "partial" ? { kind: "paused", have: boot.status.have } : { kind: "idle" }));
  const [estimate, setEstimate] = useState<StorageEstimate | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);
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
  const percent = phase.kind === "downloading" ? Math.floor((phase.have / (phase.total ?? source.bytes)) * 100) : phase.kind === "verifying" ? 100 : 0;
  return (
    /* The card grows when the option list opens; at 390 that is taller than the viewport, so the door scrolls. */
    <ScrollView testID="download-door" contentContainerStyle={styles.doorScroll}>
      <View style={[styles.card, { borderColor: theme.border, backgroundColor: theme.surface1 }]}>
        <Text style={[styles.monoLabel, { color: theme.sealed }]}>{t("chat.onDevice")}</Text>
        <Text style={[styles.headline, { color: theme.text }]}>{t("web.download.title", { model: source.name })}</Text>
        {/* Why this one and not another (Moshe, 24.9): the reason belongs beside the offer, above the list of the rest. */}
        {choice?.recommended ? (
          <>
            <Text style={[styles.monoLabel, { color: theme.accent }]}>{t("models.recommended", { device: deviceNoun() })}</Text>
            <Text testID="web-download-why" style={[styles.body, { color: theme.text2 }]}>
              {t("web.download.why")}
            </Text>
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
          <Text testID="download-error" style={[styles.body, { color: theme.danger }]}>
            {t("web.download.failed", { error: phase.message })}
          </Text>
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
              {phase.kind === "paused" ? t("web.download.resume", { done: formatModelBytes(phase.have), total: size }) : t("web.download.button", { size })}
            </Text>
          </Pressable>
        )}
        <Text style={[styles.caption, { color: theme.text3 }]}>{t("web.download.keepExplain")}</Text>
        <ModelOptions choices={boot.choices} currentId={source.id} onChoose={(id) => void choose(id)} theme={theme} disabled={busy} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  strip: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 12, paddingVertical: 6, borderBottomWidth: 1 },
  stripText: { flex: 1, gap: 2 },
  summaryRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  stripDetail: { gap: 2, paddingTop: 2 },
  /* The strip is already 44 tall because of Get the app, so the finger target costs no height, and hitSlop={6} buys nothing on the browser tier (F243). */
  detailsBtn: { flexDirection: "row", alignItems: "center", gap: 3, minHeight: MIN_TOUCH },
  grow: { flex: 1 },
  getApp: { minHeight: MIN_TOUCH, paddingHorizontal: 12, borderWidth: 1, borderRadius: radius.chip, justifyContent: "center" },
  switchRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingTop: 2 },
  door: { flex: 1, alignItems: "center", justifyContent: "center", padding: 16 },
  doorScroll: { flexGrow: 1, alignItems: "center", justifyContent: "center", padding: 16 },
  card: { width: "100%", maxWidth: 440, padding: 20, gap: 12, borderWidth: 1, borderRadius: radius.card },
  headline: { ...font("sans", "600"), fontSize: 22, letterSpacing: -0.2 },
  body: { ...font("sans"), fontSize: 16, lineHeight: 22 },
  caption: { ...font("sans"), fontSize: 12, lineHeight: 16 },
  strong: { fontWeight: "600" },
  mono: { ...font("mono"), fontSize: 12, letterSpacing: 0.3 },
  monoLabel: { ...font("mono", "500"), fontSize: 11, letterSpacing: 0.9, textTransform: "uppercase" },
  cta: { minHeight: 44, paddingHorizontal: 20, borderRadius: radius.control, alignItems: "center", justifyContent: "center" },
  textBtn: { minHeight: MIN_TOUCH, justifyContent: "center" },
  progressWrap: { gap: 8 },
  track: { height: 6, borderRadius: 3, overflow: "hidden" },
  fill: { height: 6 },
});
