import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { useTheme } from "../../services/theme";
import { useAppServices } from "../../services/AppServices";
import { Screen } from "../../components/shell/Screen";
import { Seal, type SealState } from "../../components/Seal";
import { Button, MonoLabel } from "../../components/shell/primitives";
import { useType } from "../../services/type";
import { deviceNoun } from "../../lib/deviceNoun";

/** S04, the peak: the ring snaps shut, one haptic, "SEALED · ON-DEVICE". */
export function Sealed() {
  const type = useType();
  const { t } = useTranslation();
  const { theme } = useTheme();
  const router = useRouter();
  const { prefs, setSealState: setGlobalSeal } = useAppServices();
  const [state, setState] = useState<SealState>("open");
  const [done, setDone] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setState("sealing"), 350);
    return () => clearTimeout(id);
  }, []);

  return (
    <Screen header={null} mesh testID="onboarding-sealed" footer={<Button testID="sealed-start" title={t("onboarding.sealed.start")} onPress={() => router.push("/onboarding/lock")} disabled={!done} />}>
      <View style={styles.hero}>
        <Seal
          size={72}
          state={state}
          label={t("onboarding.sealed.label")}
          haptics={prefs.haptics}
          onSealed={() => {
            setDone(true);
            setGlobalSeal("sealed");
          }}
        />
        <MonoLabel color={done ? theme.sealed : theme.text3} testID="sealed-label">
          {t("onboarding.sealed.label")}
        </MonoLabel>
        <Text style={[type.title, styles.center, { color: theme.text }]}>{t("onboarding.sealed.line", { device: deviceNoun() })}</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({ hero: { alignItems: "center", gap: 20, paddingTop: 96, paddingHorizontal: 8 }, center: { textAlign: "center" } });
