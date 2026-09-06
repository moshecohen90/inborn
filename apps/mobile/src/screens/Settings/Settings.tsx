import { useEffect, useState } from "react";
import { AccessibilityInfo, DevSettings, I18nManager, Platform, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { LOCK_TIMEOUTS } from "@inborn/core";
import { biometricLabel } from "@inborn/i18n";
import { TEXT_SCALES, type ThemeMode } from "@inborn/ui";
import { useTheme } from "../../services/theme";
import { useAppServices } from "../../services/AppServices";
import { canBlockScreenshots } from "../../../modules/secure-screen";
import { setDeviceStateForPreview } from "../../device/useDeviceState";
import { idleDeviceState } from "../../device/types";
import type { AutoDeleteDays, PerformanceProfile } from "../../services/prefsTypes";
import { Screen } from "../../components/shell/Screen";
import { Row, Section, Segmented } from "../../components/shell/primitives";
import { PasscodeSheet } from "../../lock/PasscodeSheet";
import { WipeSheet } from "./WipeSheet";
import { lockCopy, timeoutLabel } from "../Onboarding/LockOffer";
import { useType } from "../../services/type";

const AUTO_DELETE: AutoDeleteDays[] = [0, 1, 7, 30];
const WIPE_AFTER: (number | null)[] = [null, 5, 10];
const PROFILES: PerformanceProfile[] = ["eco", "balanced", "max"];
const PREVIEWS = ["none", "storage", "thermalSerious", "thermalCritical", "lowPower", "battery", "delivering"] as const;

/** S52: few settings, phrased as trade-offs, no telemetry switch because there is no telemetry. */
export function Settings() {
  const type = useType();
  const { t, i18n } = useTranslation();
  const { theme } = useTheme();
  const router = useRouter();
  const { prefs, updatePrefs, lock, setDelivery, engine } = useAppServices();
  const [passcodeOpen, setPasscodeOpen] = useState(false);
  const [wipeOpen, setWipeOpen] = useState(false);
  const [reduceMotion, setReduceMotion] = useState<boolean | null>(null);
  const [preview, setPreview] = useState<(typeof PREVIEWS)[number]>("none");
  const label = biometricLabel(t, lock.kind);
  const copy = lockCopy(t, lock.kind, label);
  const setLock = (patch: Partial<typeof prefs.lock>) => updatePrefs((p) => ({ lock: { ...p.lock, ...patch } }));

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => setReduceMotion(!!v))
      .catch(() => setReduceMotion(null));
  }, []);

  const toggleLock = (on: boolean) => {
    if (on && lock.kind === "passcode" && !lock.passcodeSet) setPasscodeOpen(true);
    else setLock({ enabled: on });
  };

  const applyPreview = (p: (typeof PREVIEWS)[number]) => {
    setPreview(p);
    setDelivery(null);
    switch (p) {
      case "storage":
        return setDeviceStateForPreview({ ...idleDeviceState, recommendation: { kind: "storageFull", freeBytes: 0 } });
      case "thermalSerious":
        return setDeviceStateForPreview({ ...idleDeviceState, thermal: "serious" });
      case "thermalCritical":
        return setDeviceStateForPreview({ ...idleDeviceState, thermal: "critical", recommendation: { kind: "pause", reason: "thermal" } });
      case "lowPower":
        return setDeviceStateForPreview({ ...idleDeviceState, battery: { level: 0.15, lowPowerMode: true }, recommendation: { kind: "switchToInstant", reason: "lowPower", auto: true } });
      case "battery":
        return setDeviceStateForPreview({ ...idleDeviceState, battery: { level: 0.18, lowPowerMode: false }, recommendation: { kind: "switchToInstant", reason: "battery", auto: false } });
      case "delivering":
        setDeviceStateForPreview(idleDeviceState);
        return setDelivery({ name: "FAST", status: "delivering", progress: 0.41, totalBytes: 1.3 * 1024 ** 3 });
      default:
        return setDeviceStateForPreview(idleDeviceState);
    }
  };

  return (
    <Screen header={{ back: true, title: t("settings.title") }} testID="settings">
      <Section title={t("settings.appearance")}>
        <Text style={[type.bodySmall, { color: theme.text2 }]}>{t("settings.appearance.theme")}</Text>
        <Segmented<ThemeMode>
          testID="theme-mode"
          options={[
            { value: "system", label: t("settings.appearance.system") },
            { value: "dark", label: t("settings.appearance.dark") },
            { value: "light", label: t("settings.appearance.light") },
          ]}
          value={prefs.themeMode}
          onChange={(m) => updatePrefs({ themeMode: m })}
        />
        <Text style={[type.bodySmall, { color: theme.text2 }]}>{t("settings.appearance.textSize")}</Text>
        <Segmented<number>
          testID="text-scale"
          options={TEXT_SCALES.map((s) => ({ value: s, label: s === 1 ? t("settings.appearance.textDefault") : `${Math.round(s * 100)}%` }))}
          value={prefs.textScale}
          onChange={(s) => updatePrefs({ textScale: s })}
        />
      </Section>

      <Section title={t("settings.security")}>
        <Row testID="row-lock" label={copy.require} sub={copy.explain} toggle={prefs.lock.enabled} onToggle={toggleLock} />
        {prefs.lock.enabled ? (
          <View style={styles.inset}>
            <Text style={[type.bodySmall, { color: theme.text2 }]}>{t("lock.delay")}</Text>
            <Segmented testID="lock-timeout" options={LOCK_TIMEOUTS.map((s) => ({ value: s, label: timeoutLabel(t, s) }))} value={prefs.lock.timeoutSec} onChange={(s) => setLock({ timeoutSec: s })} />
          </View>
        ) : null}
        {lock.kind === "passcode" ? <Row label={lock.passcodeSet ? t("passcode.change") : t("passcode.set")} onPress={() => setPasscodeOpen(true)} chevron /> : null}
        <Row
          testID="row-hide"
          label={t("settings.security.hideInSwitcher")}
          sub={Platform.OS === "android" ? t("settings.security.hideInSwitcher.android") : t("settings.security.hideInSwitcher.sub")}
          toggle={prefs.lock.hideInSwitcher}
          onToggle={(v) => setLock({ hideInSwitcher: v })}
          disabled={Platform.OS === "web"}
        />
        <Row
          testID="row-screenshots"
          label={t("settings.security.screenshots")}
          sub={canBlockScreenshots() ? t("settings.security.screenshots.android") : Platform.OS === "ios" ? t("settings.security.screenshots.ios") : t("settings.security.screenshots.web")}
          toggle={prefs.lock.screenshotProtection}
          onToggle={(v) => setLock({ screenshotProtection: v })}
          disabled={Platform.OS === "web"}
        />
        <Text style={[type.bodySmall, styles.label, { color: theme.text2 }]}>{t("settings.security.panicWipe")}</Text>
        <Segmented<string>
          testID="wipe-after"
          options={WIPE_AFTER.map((n) => ({ value: String(n), label: n === null ? t("settings.off") : t("settings.security.attempts", { count: n }) }))}
          value={String(prefs.lock.wipeAfterFailed)}
          onChange={(v) => setLock({ wipeAfterFailed: v === "null" ? null : Number(v) })}
        />
        <Text style={[type.bodySmall, styles.label, { color: theme.text2 }]}>{t("settings.security.autoDelete")}</Text>
        <Segmented<AutoDeleteDays>
          options={AUTO_DELETE.map((d) => ({ value: d, label: d === 0 ? t("settings.off") : t("settings.security.days", { count: d }) }))}
          value={prefs.autoDeleteDays}
          onChange={(d) => updatePrefs({ autoDeleteDays: d })}
        />
        <Text style={[type.bodySmall, styles.label, { color: theme.text2 }]}>{t("settings.security.clipboard")}</Text>
        <Segmented<number>
          options={[
            { value: 0, label: t("settings.off") },
            { value: 60, label: t("settings.security.seconds", { count: 60 }) },
          ]}
          value={prefs.clipboardExpirySec}
          onChange={(s) => updatePrefs({ clipboardExpirySec: s })}
        />
        <Row testID="row-wipe" label={t("wipe.title")} sub={t("wipe.row")} onPress={() => setWipeOpen(true)} danger chevron />
      </Section>

      <Section title={t("settings.chat")}>
        <Row label={t("settings.chat.model")} value={engine.model.id.toUpperCase()} onPress={() => router.push("/vault")} chevron />
        <Row label={t("settings.chat.haptics")} toggle={prefs.haptics} onToggle={(v) => updatePrefs({ haptics: v })} />
        <Row label={t("settings.chat.sounds")} sub={t("settings.chat.soundsSub")} toggle={false} onToggle={() => undefined} disabled />
      </Section>

      <Section title={t("settings.performance")}>
        <Segmented<PerformanceProfile> options={PROFILES.map((p) => ({ value: p, label: t(`settings.performance.${p}`) }))} value={prefs.performance} onChange={(p) => updatePrefs({ performance: p })} />
        <Row label={t("settings.performance.autoPower")} sub={t("settings.performance.autoPowerSub")} toggle={prefs.autoPower} onToggle={(v) => updatePrefs({ autoPower: v })} />
        <Row label={t("settings.performance.neverSwitch")} toggle={prefs.neverAutoSwitch} onToggle={(v) => updatePrefs({ neverAutoSwitch: v })} />
      </Section>

      <Section title={t("settings.language")}>
        <Row testID="row-language" label={t("settings.language.ui")} value={languageName(i18n.language)} onPress={() => router.push("/settings/language")} chevron />
        <Row label={t("settings.language.answer")} value={prefs.answerLanguage ? languageName(prefs.answerLanguage) : t("settings.language.followsUi")} onPress={() => router.push("/settings/language?answer=1")} chevron />
      </Section>

      <Section title={t("settings.downloads")}>
        <Row label={t("settings.downloads.wifiOnly")} toggle={prefs.wifiOnly} onToggle={(v) => updatePrefs({ wifiOnly: v })} />
        <Row label={t("settings.downloads.storage")} value={t("settings.downloads.internal")} />
      </Section>

      <Section title={t("settings.accessibility")}>
        <Row label={t("settings.accessibility.reduceMotion")} value={reduceMotion === null ? "—" : reduceMotion ? t("settings.on") : t("settings.off")} sub={t("settings.accessibility.followsSystem")} />
      </Section>

      <Section title={t("settings.storageSection")}>
        <Row testID="row-storage" label={t("storage.title")} onPress={() => router.push("/settings/storage")} chevron />
        <Row testID="row-proof" label={t("proof.title")} onPress={() => router.push("/proof")} chevron />
      </Section>

      <Section title={t("settings.about")}>
        <Row testID="row-about" label={t("about.title")} onPress={() => router.push("/settings/about")} chevron />
        <Row label={t("about.modelLicenses")} onPress={() => router.push("/settings/licenses")} chevron />
        <Text style={[type.bodySmall, styles.label, { color: theme.text3 }]}>{t("settings.privacy")}</Text>
      </Section>

      {__DEV__ ? (
        <Section title={t("settings.advanced")}>
          <Text style={[type.bodySmall, { color: theme.text2 }]}>{t("settings.advanced.preview")}</Text>
          <Segmented testID="preview-state" options={PREVIEWS.map((p) => ({ value: p, label: p }))} value={preview} onChange={applyPreview} />
          {Platform.OS === "web" ? null : (
            <Row
              testID="row-force-rtl"
              label={t("settings.advanced.rtl")}
              toggle={I18nManager.isRTL}
              onToggle={(v) => {
                I18nManager.allowRTL(v);
                I18nManager.forceRTL(v);
                DevSettings.reload();
              }}
            />
          )}
        </Section>
      ) : null}

      <PasscodeSheet
        visible={passcodeOpen}
        mode="set"
        onClose={() => setPasscodeOpen(false)}
        onSubmit={async (code) => {
          await lock.setPasscode(code);
          setPasscodeOpen(false);
          setLock({ enabled: true });
          return true;
        }}
      />
      <WipeSheet visible={wipeOpen} onClose={() => setWipeOpen(false)} />
    </Screen>
  );
}

export function languageName(tag: string): string {
  try {
    return new Intl.DisplayNames([tag], { type: "language" }).of(tag) ?? tag;
  } catch {
    return tag;
  }
}

const styles = StyleSheet.create({ inset: { paddingTop: 8 }, label: { paddingTop: 12 } });
