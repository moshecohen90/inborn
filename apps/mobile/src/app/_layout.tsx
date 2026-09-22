import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { AppServicesProvider, useAppServices } from "../services/AppServices";
import { applyThemeMode, useTheme } from "../services/theme";
import { mergePrefs } from "../services/prefsTypes";
import { readPrefsRaw } from "../services/prefsStore";
import { useAppFonts } from "../services/fonts";
import { Banners } from "../components/shell/Banners";
import { DeviceExplainSheet } from "../components/shell/DeviceExplainSheet";
import { BANNER_TOP, BannerInsetContext } from "../components/shell/bannerInset";
import { PrivacyCover } from "../lock/PrivacyCover";
import { LockScreen } from "../lock/LockScreen";
import { Seal } from "../components/Seal";
import { WebShell } from "../web/WebShell";
import { useShareTarget } from "../share";
import { closeOpenSheets } from "../lib/openSheets";
import { WideShell } from "../components/shell/WideShell";
import { CommandPalette } from "../components/shell/CommandPalette";
import { SIDEBAR_WIDTH, isWide } from "../lib/layout";
import { useLayoutMode } from "../lib/useLayout";
import { useDesktopKeys } from "../components/shell/useDesktopKeys";
import { useShortcut } from "../lib/shortcuts";
import { closeSidePanel } from "../lib/sidePanel";
import { toggleSidebar, useSidebarOpen } from "../lib/sidebar";

/* The stored theme is applied before the first paint (QA B14): the splash, the lock screen and the status bar never show the system scheme first. */
applyThemeMode(mergePrefs(readPrefsRaw(), Date.now()).themeMode);

export default function RootLayout() {
  /* Plex is the brand (§9.3): nothing draws in a system face while the files register. */
  const fontsReady = useAppFonts();
  return (
    <SafeAreaProvider>
      {!fontsReady ? <Splash /> : (
      <AppServicesProvider fallback={<Splash />}>
        <WebShell>
          <Shell />
        </WebShell>
      </AppServicesProvider>
      )}
    </SafeAreaProvider>
  );
}

/** Boot takes a moment on the web (wllama probe) and the first phone launch (key + database): the sealed ring, nothing else. */
function Splash() {
  const { theme, scheme } = useTheme();
  return (
    <View style={[styles.splash, { backgroundColor: theme.bg }]}>
      <Seal size={72} state="sealed" label="Inborn" haptics={false} />
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
    </View>
  );
}

function Shell() {
  const { theme, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { lock, prefs, captured, openShared } = useAppServices();
  const [bannerInset, setBannerInset] = useState(0);
  const mode = useLayoutMode();
  /* Onboarding and the legal screens own the whole window: a chats sidebar beside a first-run screen would be the shell before the app exists. */
  const segments = useSegments();
  const fullBleed = segments[0] === "onboarding" || segments[0] === "legal" || segments[0] === "lock";
  const wide = isWide(mode) && !fullBleed;
  const sidebar = useSidebarOpen();
  const [palette, setPalette] = useState(false);
  useDesktopKeys(wide);
  useShortcut("palette", () => wide && setPalette((p) => !p));
  useShortcut("toggle-sidebar", () => wide && toggleSidebar());
  /* Esc is Stop; with the palette up it is also the way out of it. */
  useShortcut("stop", () => setPalette(false));
  /* A window narrowed back to the phone shell has nowhere to put either of them. */
  useEffect(() => {
    if (wide) return;
    setPalette(false);
    closeSidePanel();
  }, [wide]);
  /* Shared text / files (§7.7) land in a fresh chat; whatever screen was up gives way to it. The lock, if on, stays in front. */
  useShareTarget((payload) => {
    closeOpenSheets();
    openShared(payload);
    if (router.canGoBack()) router.dismissTo("/");
  });
  const cover = (lock.covered && prefs.lock.enabled && prefs.lock.hideInSwitcher) || (captured && prefs.lock.screenshotProtection);
  const stack = (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.bg } }}>
      <Stack.Screen name="chats" options={{ animation: "slide_from_left" }} />
      <Stack.Screen name="paywall" options={{ presentation: "modal" }} />
      <Stack.Screen name="voice" options={{ presentation: "fullScreenModal", animation: "fade" }} />
    </Stack>
  );
  return (
    <View style={[styles.root, { backgroundColor: theme.bg }]}>
      <BannerInsetContext.Provider value={bannerInset}>
        {wide ? (
          <WideShell mode={mode} sidebar={sidebar}>
            {stack}
          </WideShell>
        ) : (
          stack
        )}
      </BannerInsetContext.Provider>
      {/* Under the header of whichever screen is up (§8.8); its measured height reaches screens that keep a row there (QA F13). Beside a sidebar it sits over the column, not over the list. */}
      <View pointerEvents="box-none" style={[styles.banners, { top: insets.top + BANNER_TOP, left: wide && sidebar ? SIDEBAR_WIDTH : 0 }]} onLayout={(e) => setBannerInset(Math.round(e.nativeEvent.layout.height))}>
        <Banners />
      </View>
      {wide ? <CommandPalette visible={palette} onClose={() => setPalette(false)} /> : null}
      {/* §8.8 row 4c: app-wide, like the strip above it — the switch happens wherever the user is. */}
      <DeviceExplainSheet />
      {cover ? <PrivacyCover captured={captured} /> : null}
      {lock.locked ? <LockScreen /> : null}
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  splash: { flex: 1, alignItems: "center", justifyContent: "center" },
  banners: { position: "absolute", right: 0 },
});
