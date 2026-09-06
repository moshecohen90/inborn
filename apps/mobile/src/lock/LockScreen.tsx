import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { attemptsLeft, showCountdown } from "@inborn/core";
import { biometricLabel } from "@inborn/i18n";

import { useTheme, FONT } from "../services/theme";
import { useAppServices } from "../services/AppServices";
import { Seal } from "../components/Seal";
import { Button, MonoLabel } from "../components/shell/primitives";
import { PasscodeSheet } from "./PasscodeSheet";
import { WipeSheet } from "../screens/Settings/WipeSheet";

/** S53: the seal, "Locked", the biometric prompt by itself, a passcode as the fallback. Rendered above everything while locked. */
export function LockScreen() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { lock, prefs } = useAppServices();
  const [passcodeOpen, setPasscodeOpen] = useState(false);
  const [wipeOpen, setWipeOpen] = useState(false);
  const prompted = useRef(false);
  const label = biometricLabel(t, lock.kind);
  const biometric = lock.kind !== "passcode";
  const left = attemptsLeft(lock.failed, prefs.lock.wipeAfterFailed);
  const countdown = showCountdown(lock.failed, prefs.lock.wipeAfterFailed) && left !== null ? t("lock.attemptsLeft", { count: left }) : null;

  useEffect(() => {
    if (!lock.ready || prompted.current) return;
    prompted.current = true;
    if (biometric) void lock.unlock(t("lock.prompt"), t("chats.cancel"));
    else if (lock.passcodeSet) setPasscodeOpen(true);
  }, [lock, biometric, t]);

  return (
    <View testID="lock-screen" style={[StyleSheet.absoluteFill, styles.root, { backgroundColor: theme.bg, paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
      <View style={styles.center}>
        <Pressable accessibilityRole="button" accessibilityLabel={t("wipe.title")} onLongPress={() => setWipeOpen(true)} delayLongPress={1200}>
          <Seal size={72} state="sealed" label={t("chat.sealed")} haptics={false} />
        </Pressable>
        <MonoLabel color={theme.text2} style={styles.locked} testID="lock-label">
          {t("lock.locked")}
        </MonoLabel>
        <Text style={[styles.explain, { color: theme.text2 }]}>{biometric ? t("lock.lockedExplain", { biometric: label }) : t("lock.lockedExplainPasscode")}</Text>
        {countdown ? (
          <Text testID="wipe-countdown" style={[styles.explain, { color: theme.danger }]}>
            {countdown}
          </Text>
        ) : null}
      </View>
      <View style={styles.actions}>
        {biometric ? <Button testID="unlock-biometric" title={t("lock.unlockWith", { biometric: label })} onPress={() => void lock.unlock(t("lock.prompt"), t("chats.cancel"))} /> : null}
        {lock.passcodeSet ? (
          <Button testID="unlock-passcode" title={t("lock.usePasscode")} variant={biometric ? "link" : "cta"} onPress={() => setPasscodeOpen(true)} />
        ) : !biometric ? (
          <Text style={[styles.explain, { color: theme.danger }]}>{t("lock.noPasscode")}</Text>
        ) : null}
      </View>
      <PasscodeSheet visible={passcodeOpen} mode="verify" onClose={() => setPasscodeOpen(false)} onSubmit={lock.unlockWithPasscode} warning={countdown} />
      <WipeSheet visible={wipeOpen} onClose={() => setWipeOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { paddingHorizontal: 24, justifyContent: "space-between" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16 },
  locked: { marginTop: 8 },
  explain: { fontFamily: FONT.sans, fontSize: 15, lineHeight: 22, textAlign: "center", maxWidth: 320 },
  actions: { gap: 4 },
});
