import { StyleSheet, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { AppServicesProvider, useAppServices } from "../services/AppServices";
import { useTheme } from "../services/theme";
import { useAppFonts } from "../services/fonts";
import { Banners } from "../components/shell/Banners";
import { PrivacyCover } from "../lock/PrivacyCover";
import { LockScreen } from "../lock/LockScreen";
import { Seal } from "../components/Seal";
import { WebShell } from "../web/WebShell";
import { useShareTarget } from "../share";
import { closeOpenSheets } from "../lib/openSheets";

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
  /* Shared text / files (§7.7) land in a fresh chat; whatever screen was up gives way to it. The lock, if on, stays in front. */
  useShareTarget((payload) => {
    closeOpenSheets();
    openShared(payload);
    if (router.canGoBack()) router.dismissTo("/");
  });
  const cover = (lock.covered && prefs.lock.enabled && prefs.lock.hideInSwitcher) || (captured && prefs.lock.screenshotProtection);
  return (
    <View style={[styles.root, { backgroundColor: theme.bg }]}>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.bg } }}>
        <Stack.Screen name="chats" options={{ animation: "slide_from_left" }} />
        <Stack.Screen name="paywall" options={{ presentation: "modal" }} />
        <Stack.Screen name="voice" options={{ presentation: "fullScreenModal", animation: "fade" }} />
      </Stack>
      {/* Under the header of whichever screen is up: transient system states never push content around (§8.8). */}
      <View pointerEvents="box-none" style={[styles.banners, { top: insets.top + 52 }]}>
        <Banners />
      </View>
      {cover ? <PrivacyCover captured={captured} /> : null}
      {lock.locked ? <LockScreen /> : null}
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  splash: { flex: 1, alignItems: "center", justifyContent: "center" },
  banners: { position: "absolute", left: 0, right: 0 },
});
