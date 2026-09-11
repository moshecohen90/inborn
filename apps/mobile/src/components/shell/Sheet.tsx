import type { ReactNode } from "react";
import { Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { radius } from "@inborn/ui";
import { useTheme } from "../../services/theme";
import { useKeyboardLift } from "../../lib/keyboard";
import { sheetGeometry } from "../../lib/keyboardLayout";
import { font } from "../../services/type";
import { GlassFill, panelColor, panelStyle } from "./NativeChrome";
import { useOpenSheet } from "../../lib/openSheets";

/** Bottom sheet (§9.4 radius 20, 280 ms): confirmations, the network log, the passcode entry. */
export function Sheet({ visible, onClose, title, children, testID }: { visible: boolean; onClose: () => void; title?: string; children: ReactNode; testID?: string }) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const lift = useKeyboardLift();
  const { height: windowHeight } = useWindowDimensions();
  const geometry = sheetGeometry({ lift, safeBottom: insets.bottom, safeTop: insets.top, windowHeight, basePadding: 20, share: 0.85 });
  useOpenSheet(visible, onClose);
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable accessibilityLabel="Close" style={styles.backdrop} onPress={onClose} />
      <View testID={testID} style={[styles.sheet, panelStyle, geometry, { backgroundColor: panelColor(theme.surface1), borderColor: theme.border }]}>
        <GlassFill />
        {title ? <Text style={[styles.title, { color: theme.text }]}>{title}</Text> : null}
        {children}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.45)" },
  sheet: { position: "absolute", left: 0, right: 0, bottom: 0, padding: 20, gap: 12, borderTopWidth: 1, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet },
  title: { ...font("sans", "600"), fontSize: 17, marginBottom: 4 },
});
