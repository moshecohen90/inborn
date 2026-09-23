import { useEffect, useRef, useState, type ReactNode } from "react";
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { PaywallReason } from "@inborn/core";
import { MIN_TOUCH } from "@inborn/ui";
import { openPaywall } from "../../licence/openPaywall";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../lib/theme";
import { useKeyboardLift } from "../../lib/keyboard";
import { sheetGeometry } from "../../lib/keyboardLayout";
import { shape } from "./styles";
import { useType } from "../../services/type";
import { GlassFill, panelColor, panelStyle } from "../shell/NativeChrome";
import { useOpenSheet } from "../../lib/openSheets";
import { useWide } from "../../lib/useLayout";

interface SheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  testID?: string;
  /** Sheets that hold a list scroll inside; short ones do not. */
  scroll?: boolean;
}

/** Bottom sheet (§9.4: radius 20, 280 ms). One primitive for every sheet in the chat stream. */
export function Sheet({ visible, onClose, title, children, testID, scroll = true }: SheetProps) {
  const type = useType();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const lift = useKeyboardLift();
  const { height: windowHeight } = useWindowDimensions();
  const geometry = sheetGeometry({ lift, safeBottom: insets.bottom, safeTop: insets.top, windowHeight, basePadding: 16, share: 0.88 });
  const Body = scroll ? ScrollView : View;
  const presented = usePresentedOrRetry(visible);
  /* §8.9: a window with a sidebar has no bottom edge to rise from — the same sheet is a centred dialog there. */
  const wide = useWide();
  useOpenSheet(visible, onClose);
  const inner = (
    <>
      <GlassFill />
      {wide ? null : <View style={[styles.grabber, { backgroundColor: theme.border }]} />}
      {title ? <Text style={[type.title, styles.title, { color: theme.text }]}>{title}</Text> : null}
      <Body style={[styles.body, scroll ? styles.shrink : null]} keyboardShouldPersistTaps="handled">
        {children}
      </Body>
    </>
  );
  return (
    <Modal key={presented.key} visible={visible} transparent animationType={wide ? "fade" : "slide"} onRequestClose={onClose} onShow={presented.onShow}>
      <Pressable style={[shape.fill, styles.backdrop]} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
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

const RETRY_MS = 600;
const RETRY_MAX = 8;

/* iOS drops a Modal presented while another one is still on screen (a sheet of the screen a share just popped, say) and never retries; remounting it after that one is gone does. */
function usePresentedOrRetry(visible: boolean): { key: number; onShow: () => void } {
  const [key, setKey] = useState(0);
  const shown = useRef(false);
  useEffect(() => {
    shown.current = false;
    if (!visible || Platform.OS === "web") return;
    let tries = 0;
    const timer = setInterval(() => {
      if (shown.current || tries++ >= RETRY_MAX) return clearInterval(timer);
      setKey((k) => k + 1);
    }, RETRY_MS);
    return () => clearInterval(timer);
  }, [visible]);
  return { key, onShow: () => (shown.current = true) };
}

/** One tappable line inside a sheet. */
export function SheetItem({ label, hint, onPress, danger, disabled, testID, trailing }: { label: string; hint?: string; onPress: () => void; danger?: boolean; disabled?: boolean; testID?: string; trailing?: ReactNode }) {
  const type = useType();
  const theme = useTheme();
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityState={{ disabled: !!disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.item, { backgroundColor: pressed ? theme.surface2 : "transparent", opacity: disabled ? 0.45 : 1 }]}>
      <View style={styles.itemText}>
        <Text style={[type.body, { color: danger ? theme.danger : theme.text }]}>{label}</Text>
        {hint ? <Text style={[type.bodySmall, { color: theme.text2 }]}>{hint}</Text> : null}
      </View>
      {trailing}
    </Pressable>
  );
}

/** Small "PRO" tag next to a gated action: tapping it opens the paywall (S60), the value moment of §12.3. */
export function ProTag({ onPress, reason }: { onPress?: () => void; reason?: PaywallReason } = {}) {
  const type = useType();
  const theme = useTheme();
  const { t } = useTranslation();
  return (
    <Pressable testID="pro-tag" accessibilityRole="button" accessibilityLabel={t("gate.unlock")} onPress={onPress ?? (() => openPaywall(reason))} style={styles.tagTarget}>
      <View style={[shape.chip, { borderColor: theme.accent, minHeight: 22 }]}>
        <Text style={[type.monoLabel, { color: theme.accent }]}>PRO</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: "rgba(0,0,0,0.45)" },
  sheet: { position: "absolute", left: 0, right: 0, bottom: 0, paddingTop: 8, borderTopWidth: 1, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  centre: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center", padding: 24 },
  dialog: { width: "100%", maxWidth: 560, paddingTop: 16, paddingBottom: 16, borderWidth: 1, borderRadius: 20 },
  tagTarget: { minHeight: MIN_TOUCH, justifyContent: "center" },
  grabber: { alignSelf: "center", width: 36, height: 4, borderRadius: 2, marginBottom: 8 },
  title: { paddingHorizontal: 20, paddingVertical: 8 },
  body: { paddingHorizontal: 8 },
  shrink: { flexShrink: 1 },
  item: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 48, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  itemText: { flex: 1, gap: 2 },
});
