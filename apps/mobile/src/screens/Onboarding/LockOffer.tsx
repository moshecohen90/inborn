import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { LOCK_TIMEOUTS, type BiometricKind } from "@inborn/core";
import { biometricLabel } from "@inborn/i18n";
import { useTheme } from "../../services/theme";
import { useAppServices } from "../../services/AppServices";
import { Screen } from "../../components/shell/Screen";
import { Button, Segmented, Toggle } from "../../components/shell/primitives";
import { PasscodeSheet } from "../../lock/PasscodeSheet";
import { useType } from "../../services/type";
import { useWide } from "../../lib/useLayout";

/** S53: the passcode variant reads as its own sentence instead of "a passcode opens Inborn". */
export function lockCopy(t: (k: string, o?: Record<string, unknown>) => string, kind: BiometricKind, label: string): { require: string; explain: string } {
  if (kind === "passcode") return { require: t("lock.require.passcode"), explain: t("lock.explain.passcode") };
  return { require: t("lock.require", { biometric: label }), explain: t("lock.explain", { biometric: label }) };
}

export const timeoutLabel = (t: (k: string, o?: Record<string, unknown>) => string, sec: number) => (sec === 0 ? t("lock.timeout.now") : t("lock.timeout.minutes", { count: sec / 60 }));

/** S05: offer the lock when the emotional value is highest, never force it. Passcode devices set a code first. */
export function LockOffer() {
  const type = useType();
  const { t } = useTranslation();
  const { theme } = useTheme();
  const router = useRouter();
  const { lock, prefs, updatePrefs } = useAppServices();
  const [on, setOn] = useState(false);
  const [timeout, setTimeoutSec] = useState<number>(0);
  const [passcodeOpen, setPasscodeOpen] = useState(false);
  const wide = useWide();
  const label = biometricLabel(t, lock.kind);
  const copy = lockCopy(t, lock.kind, label);

  const finish = (enabled: boolean) => {
    updatePrefs({ onboarded: true, lock: { ...prefs.lock, enabled, timeoutSec: timeout } });
    router.replace("/");
  };
  const turnOn = () => {
    if (lock.kind === "passcode" && !lock.passcodeSet) setPasscodeOpen(true);
    else finish(true);
  };

  return (
    <Screen
      header={null}
      mesh
      card
      testID="onboarding-lock"
      footer={
        <>
          {on ? <Button testID="lock-turn-on" title={t("lock.turnOnAndStart")} onPress={turnOn} /> : <Button testID="lock-start" title={t("onboarding.sealed.start")} onPress={() => finish(false)} />}
          {on ? <Button title={t("lock.notNow")} variant="link" onPress={() => finish(false)} /> : null}
        </>
      }
    >
      <View style={[styles.top, wide ? styles.topOnCard : null]}>
        <Text accessibilityRole="header" style={[type.title, { color: theme.text }]}>
          {t("lock.title")}
        </Text>
        <View style={styles.row}>
          <View style={styles.grow}>
            <Text style={[type.body, { color: theme.text }]}>{copy.require}</Text>
            <Text style={[type.bodySmall, { color: theme.text2 }]}>{copy.explain}</Text>
          </View>
          <Toggle testID="lock-switch" value={on} onChange={setOn} label={copy.require} />
        </View>
        {on ? (
          <View>
            <Text style={[type.bodySmall, { color: theme.text2 }]}>{t("lock.delay")}</Text>
            <Segmented testID="lock-timeout" options={LOCK_TIMEOUTS.map((s) => ({ value: s, label: timeoutLabel(t, s) }))} value={timeout} onChange={setTimeoutSec} />
          </View>
        ) : null}
        {lock.kind === "passcode" ? <Text style={[type.bodySmall, { color: theme.text3 }]}>{t("lock.noBiometrics")}</Text> : null}
      </View>
      <PasscodeSheet
        visible={passcodeOpen}
        mode="set"
        onClose={() => setPasscodeOpen(false)}
        onSubmit={async (code) => {
          await lock.setPasscode(code);
          setPasscodeOpen(false);
          finish(true);
          return true;
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({ top: { gap: 20, paddingTop: 32 }, topOnCard: { paddingTop: 0 }, row: { flexDirection: "row", alignItems: "center", gap: 16 }, grow: { flex: 1, gap: 4 } });
