import { useEffect, useRef, useState, type ReactNode } from "react";
import { Linking, Pressable, StyleSheet, Text, View, useColorScheme } from "react-native";
import { useTranslation } from "react-i18next";
import { dark, light, radius, type Theme } from "@inborn/ui";
import { delivery, refreshModelStatus, webBoot, webReady, type WebBoot } from "./boot";
import { formatBytes } from "./format";
import type { DeliveryEvent } from "./modelDelivery";
import { requestPersist, spaceCheck, storageEstimate, type StorageEstimate } from "./opfs";
import { writeEnginePref } from "./prefs";
import { registerServiceWorker, type OfflineState } from "./serviceWorker";
import { font } from "../services/type";
import { Toggle } from "../components/shell/primitives";

/** The marketing site (spec §13.4) is a separate origin; this is only a link, never a fetch. */
export const GET_APP_URL = "https://inbornapp.com/";

type Phase =
  | { kind: "idle" }
  | { kind: "downloading"; have: number; total: number | null }
  | { kind: "verifying"; have: number }
  | { kind: "paused"; have: number }
  | { kind: "error"; message: string };

/** Web doors (spec §8.9, §14.3): the notice strip, the phone door, the download door and the engine switch. */
export function WebShell({ children }: { children: ReactNode }) {
  const boot = webBoot();
  const theme = useColorScheme() === "light" ? light : dark;
  const [ready] = useState(() => webReady(boot));
  const [offline, setOffline] = useState<OfflineState>("installing");

  useEffect(() => {
    void registerServiceWorker(setOffline);
  }, []);

  return (
    <View style={[styles.root, { backgroundColor: theme.bg }]}>
      <Strip boot={boot} theme={theme} offline={offline} />
      {/* The app services picked their engine at boot, before the file existed; a reload is the honest hand-over (same as the engine switch). */}
      {ready ? children : <DownloadDoor boot={boot} theme={theme} onReady={() => location.reload()} />}
    </View>
  );
}

function Strip({ boot, theme, offline }: { boot: WebBoot; theme: Theme; offline: OfflineState }) {
  const { t } = useTranslation();
  const phone = boot.gate.formFactor === "phone";
  const switchEngine = (on: boolean) => {
    writeEnginePref(on ? "chrome-nano" : "wllama");
    /* The engine is chosen once per page load (src/engine.ts caches the session); a reload is the honest switch. */
    location.reload();
  };
  return (
    <View testID="web-strip" style={[styles.strip, { backgroundColor: theme.surface1, borderColor: theme.border }]}>
      <View style={styles.stripText}>
        <Text style={[styles.caption, { color: theme.text2 }]}>{t("web.notice")}</Text>
        {phone ? (
          <Text testID="phone-door" style={[styles.caption, { color: theme.text }]}>
            {t(boot.gate.iphone ? "web.iphoneDoor" : "web.phoneLimit")}
          </Text>
        ) : null}
        {boot.gate.ramGB === null && !phone ? <Text style={[styles.caption, { color: theme.text3 }]}>{t("web.unknownMemory")}</Text> : null}
        <Text testID="web-offline-state" style={[styles.mono, { color: offline === "ready" ? theme.sealed : theme.text3 }]}>
          {t(offline === "ready" ? "web.offlineReady" : offline === "installing" ? "web.offlinePreparing" : "web.offlineUnavailable")}
          {" · "}
          {t("webStorageNotice")}
        </Text>
        {boot.chromePromptApi ? (
          <View style={styles.switchRow}>
            <Toggle testID="engine-switch" value={boot.engine === "chrome-nano"} onChange={switchEngine} />
            <Text style={[styles.caption, { color: theme.text }]}>{t("web.engine.chrome")}</Text>
          </View>
        ) : null}
      </View>
      <Pressable testID="get-app" accessibilityRole="link" onPress={() => void Linking.openURL(GET_APP_URL)} style={[styles.getApp, { borderColor: theme.border }]}>
        <Text style={[styles.caption, styles.strong, { color: theme.text }]}>{t("web.getApp")}</Text>
      </Pressable>
    </View>
  );
}

function DownloadDoor({ boot, theme, onReady }: { boot: WebBoot; theme: Theme; onReady: () => void }) {
  const { t } = useTranslation();
  const source = boot.source;
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

  if (!source) return null;
  const have = phase.kind === "paused" || phase.kind === "downloading" ? phase.have : 0;
  const space = estimate ? spaceCheck(estimate, source.bytes, have) : null;
  const size = formatBytes(source.bytes);

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
      const status = await refreshModelStatus();
      if (status.kind === "ready") onReady();
      else setPhase({ kind: "error", message: "stored file does not match" });
    }
    storageEstimate().then(setEstimate);
  };

  const busy = phase.kind === "downloading" || phase.kind === "verifying";
  const percent = phase.kind === "downloading" ? Math.floor((phase.have / (phase.total ?? source.bytes)) * 100) : phase.kind === "verifying" ? 100 : 0;
  return (
    <View testID="download-door" style={styles.door}>
      <View style={[styles.card, { borderColor: theme.border, backgroundColor: theme.surface1 }]}>
        <Text style={[styles.monoLabel, { color: theme.sealed }]}>{t("chat.onDevice")}</Text>
        <Text style={[styles.headline, { color: theme.text }]}>{t("web.download.title", { model: source.name })}</Text>
        <Text style={[styles.body, { color: theme.text2 }]}>{t("web.download.explain", { size })}</Text>
        <Text style={[styles.mono, { color: theme.text3 }]}>
          {t("web.download.storage", { free: estimate?.quota != null ? formatBytes(Math.max(0, estimate.quota - (estimate.usage ?? 0))) : "?" })}
          {persisted === null ? "" : ` · ${t(persisted ? "web.download.kept" : "web.download.notKept")}`}
        </Text>

        {space && !space.ok && !busy ? (
          <Text testID="no-space" style={[styles.body, { color: theme.danger }]}>
            {t("web.download.noSpace", { needed: formatBytes(space.needed), free: formatBytes(space.free) })}
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
              {phase.kind === "verifying" ? t("web.download.verifying") : t("web.download.progress", { done: formatBytes(phase.have), total: formatBytes(phase.total ?? source.bytes), percent })}
            </Text>
            {phase.kind === "downloading" ? (
              <Pressable testID="download-cancel" accessibilityRole="button" onPress={() => delivery.cancel()} style={styles.textBtn}>
                <Text style={[styles.body, { color: theme.text2 }]}>{t("web.download.cancel")}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : (
          <Pressable
            testID={phase.kind === "paused" ? "download-resume" : "download-model"}
            accessibilityRole="button"
            disabled={!!space && !space.ok}
            onPress={() => void start()}
            style={[styles.cta, { backgroundColor: theme.ctaFill, opacity: space && !space.ok ? 0.5 : 1 }]}
          >
            <Text style={[styles.body, styles.strong, { color: theme.ctaText }]}>
              {phase.kind === "paused" ? t("web.download.resume", { done: formatBytes(phase.have), total: size }) : t("web.download.button", { size })}
            </Text>
          </Pressable>
        )}
        <Text style={[styles.caption, { color: theme.text3 }]}>{t("web.download.keepExplain")}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  strip: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 12, paddingVertical: 6, borderBottomWidth: 1 },
  stripText: { flex: 1, gap: 2 },
  getApp: { minHeight: 32, paddingHorizontal: 12, borderWidth: 1, borderRadius: radius.chip, justifyContent: "center" },
  switchRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingTop: 2 },
  door: { flex: 1, alignItems: "center", justifyContent: "center", padding: 16 },
  card: { width: "100%", maxWidth: 440, padding: 20, gap: 12, borderWidth: 1, borderRadius: radius.card },
  headline: { ...font("sans", "600"), fontSize: 22, letterSpacing: -0.2 },
  body: { ...font("sans"), fontSize: 16, lineHeight: 22 },
  caption: { ...font("sans"), fontSize: 12, lineHeight: 16 },
  strong: { fontWeight: "600" },
  mono: { ...font("mono"), fontSize: 12, letterSpacing: 0.3 },
  monoLabel: { ...font("mono", "500"), fontSize: 11, letterSpacing: 0.9, textTransform: "uppercase" },
  cta: { minHeight: 44, paddingHorizontal: 20, borderRadius: radius.control, alignItems: "center", justifyContent: "center" },
  textBtn: { minHeight: 36, justifyContent: "center" },
  progressWrap: { gap: 8 },
  track: { height: 6, borderRadius: 3, overflow: "hidden" },
  fill: { height: 6 },
});
