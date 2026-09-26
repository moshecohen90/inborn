import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "expo-router";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../services/theme";
import { useTranslation } from "react-i18next";
import { Icon, MIN_TOUCH, radius, type Theme } from "@inborn/ui";
import { webBoot, webReady, type WebBoot } from "./boot";
import { ModelOffer } from "./ModelOffer";
import { useAppServices } from "../services/AppServices";
import { writeEnginePref } from "./prefs";
import { registerServiceWorker, type OfflineState } from "./serviceWorker";
import { font } from "../services/type";
import { Toggle } from "../components/shell/primitives";
import { webDoorsApply } from "./doors";
import { webRoute } from "./doorRoutes";

import { GET_APP_URL } from "./links";

export { GET_APP_URL, STORE_LINKS } from "./links";

/** Web doors (spec §8.9, §14.3): the notice strip, the phone door, first-run onboarding, the model offer and the engine switch. */
export function WebShell({ children }: { children: ReactNode }) {
  return webDoorsApply() ? <BrowserShell>{children}</BrowserShell> : <>{children}</>;
}

function BrowserShell({ children }: { children: ReactNode }) {
  const boot = webBoot();
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { prefs } = useAppServices();
  const [ready] = useState(() => webReady(boot));
  const [offline, setOffline] = useState<OfflineState>("installing");
  const route = webRoute(usePathname(), { ready, onboarded: prefs.onboarded, hasSource: !!boot.source });
  /* A full load, not a router hop: the web boot (catalog, OPFS state, engine) is read once per page, and a wipe or a deep link must meet a fresh one. */
  const redirect = route.kind === "redirect" ? route.to : null;

  useEffect(() => {
    void registerServiceWorker(setOffline);
  }, []);
  useEffect(() => {
    if (redirect) location.replace(redirect);
  }, [redirect]);

  /* Onboarded, and no model file any more: nothing on this browser was ever downloaded, so the browser cleared it. */
  const gone = !boot.choices.some((c) => c.installed) && boot.status.kind !== "partial";
  return (
    <View style={[styles.root, { backgroundColor: theme.bg }]}>
      <Strip boot={boot} theme={theme} offline={offline} />
      {/* The app services picked their engine at boot, before the file existed; a reload is the honest hand-over (same as the engine switch). */}
      {route.kind === "children" ? (
        children
      ) : route.kind === "model-step" ? (
        <ModelOffer framed boot={boot} theme={theme} note={gone ? t("web.modelGone") : null} onReady={() => location.reload()} />
      ) : route.kind === "catalog" ? (
        <CatalogDoor theme={theme} />
      ) : null}
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
        <Text style={[styles.caption, styles.breakAnywhere, { color: theme.text2 }]}>{t("web.notice")}</Text>
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
      {/* The two actions wrap under the notice as one group when the row cannot hold all three (W2): nothing is pushed past the window. */}
      <View style={styles.stripActions}>
        <Pressable testID="web-strip-details" accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen((o) => !o)} hitSlop={6} style={styles.detailsBtn}>
          <Icon name={open ? "chevronDown" : "chevronRight"} size={14} color={theme.text2} />
          <Text style={[styles.caption, styles.strong, { color: theme.text2 }]}>{t("web.details")}</Text>
        </Pressable>
        <Pressable testID="get-app" accessibilityRole="link" onPress={() => void Linking.openURL(GET_APP_URL)} style={[styles.getApp, { borderColor: theme.border }]}>
          <Text style={[styles.caption, styles.strong, styles.breakAnywhere, { color: theme.text }]}>{t("web.getApp")}</Text>
        </Pressable>
      </View>
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

const styles = StyleSheet.create({
  root: { flex: 1 },
  strip: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 12, rowGap: 2, paddingHorizontal: 12, paddingVertical: 6, borderBottomWidth: 1 },
  /* 200 px is the narrowest the notice may get beside the actions before they drop to their own line. */
  stripText: { flexGrow: 1, flexShrink: 1, flexBasis: 200, minWidth: 0, gap: 2 },
  stripActions: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "flex-end", columnGap: 10, flexShrink: 1, minWidth: 0, marginStart: "auto" },
  breakAnywhere: { overflowWrap: "anywhere" } as object,
  stripDetail: { gap: 2, paddingTop: 2 },
  /* The strip is already 44 tall because of Get the app, so the finger target costs no height, and hitSlop={6} buys nothing on the browser tier (F243). */
  detailsBtn: { flexDirection: "row", alignItems: "center", gap: 3, minHeight: MIN_TOUCH },
  getApp: { minHeight: MIN_TOUCH, paddingHorizontal: 12, borderWidth: 1, borderRadius: radius.chip, justifyContent: "center" },
  switchRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingTop: 2 },
  door: { flex: 1, alignItems: "center", justifyContent: "center", padding: 16 },
  card: { width: "100%", maxWidth: 440, padding: 20, gap: 12, borderWidth: 1, borderRadius: radius.card },
  headline: { ...font("sans", "600"), fontSize: 22, letterSpacing: -0.2 },
  body: { ...font("sans"), fontSize: 16, lineHeight: 22 },
  caption: { ...font("sans"), fontSize: 12, lineHeight: 16 },
  strong: { fontWeight: "600" },
  mono: { ...font("mono"), fontSize: 12, letterSpacing: 0.3 },
  cta: { minHeight: 44, paddingHorizontal: 20, borderRadius: radius.control, alignItems: "center", justifyContent: "center" },
});
