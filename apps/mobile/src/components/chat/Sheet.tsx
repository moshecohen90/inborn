import type { ReactNode } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../lib/theme";
import { shape, type } from "./styles";

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
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const Body = scroll ? ScrollView : View;
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={[shape.fill, styles.backdrop]} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
      <View testID={testID} style={[styles.sheet, { backgroundColor: theme.surface1, borderColor: theme.border, paddingBottom: insets.bottom + 16, maxHeight: "88%" }]}>
        <View style={[styles.grabber, { backgroundColor: theme.border }]} />
        {title ? <Text style={[type.title, styles.title, { color: theme.text }]}>{title}</Text> : null}
        <Body style={styles.body} keyboardShouldPersistTaps="handled">
          {children}
        </Body>
      </View>
    </Modal>
  );
}

/** One tappable line inside a sheet. */
export function SheetItem({ label, hint, onPress, danger, disabled, testID, trailing }: { label: string; hint?: string; onPress: () => void; danger?: boolean; disabled?: boolean; testID?: string; trailing?: ReactNode }) {
  const theme = useTheme();
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityState={{ disabled: !!disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.item, { backgroundColor: pressed ? theme.surface2 : "transparent", opacity: disabled ? 0.45 : 1 }]}>
      <View style={styles.itemText}>
        <Text style={[type.body, { color: danger ? theme.danger : theme.text }]}>{label}</Text>
        {hint ? <Text style={[type.caption, { color: theme.text3 }]}>{hint}</Text> : null}
      </View>
      {trailing}
    </Pressable>
  );
}

/** Small "PRO" tag next to a gated action: tapping it opens the paywall (S60), the value moment of §12.3. */
export function ProTag({ onPress }: { onPress?: () => void } = {}) {
  const theme = useTheme();
  const { t } = useTranslation();
  return (
    <Pressable testID="pro-tag" accessibilityRole="button" accessibilityLabel={t("gate.unlock")} hitSlop={8} onPress={onPress ?? (() => router.push("/paywall"))} style={[shape.chip, { borderColor: theme.accent, minHeight: 22 }]}>
      <Text style={[type.monoLabel, { color: theme.accent }]}>PRO</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: "rgba(0,0,0,0.45)" },
  sheet: { position: "absolute", left: 0, right: 0, bottom: 0, paddingTop: 8, borderTopWidth: 1, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  grabber: { alignSelf: "center", width: 36, height: 4, borderRadius: 2, marginBottom: 8 },
  title: { paddingHorizontal: 20, paddingVertical: 8 },
  body: { paddingHorizontal: 8 },
  item: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 48, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  itemText: { flex: 1, gap: 2 },
});
