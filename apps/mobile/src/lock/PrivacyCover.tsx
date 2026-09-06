import { StyleSheet, View } from "react-native";
import { BlurView } from "expo-blur";
import { useTranslation } from "react-i18next";
import { useTheme } from "../services/theme";
import { Seal } from "../components/Seal";
import { MonoLabel } from "../components/shell/primitives";

/** Hides chats in the app switcher and while the screen is mirrored/recorded on iOS (§5.7). Android uses FLAG_SECURE instead. */
export function PrivacyCover({ captured }: { captured: boolean }) {
  const { theme, scheme } = useTheme();
  const { t } = useTranslation();
  return (
    <View testID="privacy-cover" style={[StyleSheet.absoluteFill, styles.center]} pointerEvents="none">
      <BlurView intensity={90} tint={scheme} style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.bg, opacity: 0.6 }]} />
      <Seal size={72} state="sealed" label={t("chat.sealed")} haptics={false} />
      {captured ? <MonoLabel style={styles.label}>{t("lock.hiddenWhileCaptured")}</MonoLabel> : null}
    </View>
  );
}

const styles = StyleSheet.create({ center: { alignItems: "center", justifyContent: "center", gap: 16 }, label: { textAlign: "center" } });
