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
import { useEarlyEscape } from "../../lib/earlyEscape";
import { useWide } from "../../lib/useLayout";

/** Bottom sheet (§9.4 radius 20, 280 ms): confirmations, the network log, the passcode entry. */
export function Sheet({ visible, onClose, title, children, testID }: { visible: boolean; onClose: () => void; title?: string; children: ReactNode; testID?: string }) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const lift = useKeyboardLift();
  const { height: windowHeight } = useWindowDimensions();
  const geometry = sheetGeometry({ lift, safeBottom: insets.bottom, safeTop: insets.top, windowHeight, basePadding: 20, share: 0.85 });
  /* §8.9: a window with a sidebar has no bottom edge to rise from — the same sheet is a centred dialog there. */
  const wide = useWide();
  useOpenSheet(visible, onClose);
  const escapeShown = useEarlyEscape(visible, onClose);
  const inner = (
    <>
      <GlassFill />
      {title ? <Text style={[styles.title, { color: theme.text }]}>{title}</Text> : null}
      {children}
    </>
  );
  return (
    <Modal visible={visible} transparent animationType={wide ? "fade" : "slide"} onRequestClose={onClose} onShow={escapeShown}>
      <Pressable testID={testID ? `${testID}-close` : "sheet-close"} accessibilityLabel="Close" style={styles.backdrop} onPress={onClose} />
      {wide ? (
        <View pointerEvents="box-none" style={styles.centre}>
          <View testID={testID} style={[styles.dialog, panelStyle, { maxHeight: geometry.maxHeight, backgroundColor: panelColor(theme.surface1), borderColor: theme.border }]}>
            {inner}
          </View>
        </View>
      ) : (
        <View testID={testID} style={[styles.sheet, panelStyle, geometry, { backgroundColor: panelColor(theme.surface1), borderColor: theme.border }]}>
          {inner}
        </View>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.45)" },
  sheet: { position: "absolute", left: 0, right: 0, bottom: 0, padding: 20, gap: 12, borderTopWidth: 1, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet },
  centre: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center", padding: 24 },
  dialog: { width: "100%", maxWidth: 560, padding: 20, gap: 12, borderWidth: 1, borderRadius: radius.sheet },
  title: { ...font("sans", "600"), fontSize: 17, marginBottom: 4 },
});
