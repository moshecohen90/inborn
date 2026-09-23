import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";

import { useTheme } from "../../services/theme";
import { useAppServices } from "../../services/AppServices";
import { Sheet } from "../../components/shell/Sheet";
import { Button, Toggle } from "../../components/shell/primitives";
import { font } from "../../services/type";

/** Emergency wipe (§5.7): two confirmations, models optional, no recovery. Ends in onboarding with a fresh key. */
export function WipeSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const router = useRouter();
  const { wipeAll } = useAppServices();
  const [step, setStep] = useState<1 | 2>(1);
  const [models, setModels] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) {
      setStep(1);
      setBusy(false);
    }
  }, [visible]);

  const run = async () => {
    setBusy(true);
    try {
      await wipeAll({ models });
      onClose();
      router.replace("/onboarding");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={step === 1 ? t("wipe.title") : t("wipe.confirmTitle")} testID="wipe-sheet">
      <Text style={[styles.body, { color: theme.text2 }]}>{step === 1 ? t("wipe.explain") : t("wipe.confirmExplain")}</Text>
      {step === 1 ? (
        <View style={styles.row}>
          <Text style={[styles.body, styles.grow, { color: theme.text }]}>{t("wipe.alsoModels")}</Text>
          <Toggle testID="wipe-models" label={t("wipe.alsoModels")} value={models} onChange={setModels} />
        </View>
      ) : null}
      <View style={styles.actions}>
        <Button title={t("chats.cancel")} variant="link" onPress={onClose} />
        {step === 1 ? (
          <Button testID="wipe-step1" title={t("wipe.continue")} variant="danger" onPress={() => setStep(2)} style={styles.grow} />
        ) : (
          <Button testID="wipe-step2" title={t("wipe.now")} variant="danger" disabled={busy} onPress={() => void run()} style={styles.grow} />
        )}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { ...font("sans"), fontSize: 15, lineHeight: 22 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8 },
  actions: { flexDirection: "row", gap: 8, alignItems: "center" },
  grow: { flex: 1 },
});
