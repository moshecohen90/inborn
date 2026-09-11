import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import { radius, type Theme } from "@inborn/ui";
import { GlassFill, panelColor, panelStyle } from "../../components/shell/NativeChrome";
import type { LicenceManager, Rejection } from "@inborn/core";
import { font } from "../../services/type";
import { useKeyboardLift } from "../../lib/keyboard";
import { useOpenSheet } from "../../lib/openSheets";

export interface LicenceKeySheetProps {
  manager: LicenceManager;
  theme: Theme;
  onClose: () => void;
}

/** Desktop only (spec §12.4 row 4): paste the Paddle licence key; verified offline, bound to this computer. */
export function LicenceKeySheet({ manager, theme, onClose }: LicenceKeySheetProps) {
  const { t } = useTranslation();
  const [key, setKey] = useState("");
  const [result, setResult] = useState<{ ok: true } | { ok: false; reason: Rejection } | null>(null);
  const [busy, setBusy] = useState(false);

  const redeem = async () => {
    setBusy(true);
    try {
      const r = await manager.redeem(key);
      setResult(r.ok ? { ok: true } : { ok: false, reason: r.reason });
    } finally {
      setBusy(false);
    }
  };

  const lift = useKeyboardLift();
  useOpenSheet(true, onClose);
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <View style={[styles.backdrop, { paddingBottom: 24 + lift }]}>
        <View style={[styles.sheet, panelStyle, { backgroundColor: panelColor(theme.surface2), borderColor: theme.border }]}>
          <GlassFill />
          <Text style={[styles.title, { color: theme.text }]}>{t("paywall.key.title")}</Text>
          <TextInput
            testID="licence-key-input"
            value={key}
            onChangeText={setKey}
            placeholder={t("paywall.key.placeholder")}
            placeholderTextColor={theme.text3}
            autoCapitalize="none"
            autoCorrect={false}
            multiline
            style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.well }]}
          />
          {result ? (
            <Text testID="licence-key-result" style={[styles.body, { color: result.ok ? theme.sealed : theme.danger }]}>
              {result.ok ? t("paywall.key.ok") : t("paywall.key.bad", { reason: result.reason })}
            </Text>
          ) : null}
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" onPress={onClose} hitSlop={8} style={styles.btn}>
              <Text style={[styles.btnText, { color: theme.text2 }]}>{t("chats.cancel")}</Text>
            </Pressable>
            <Pressable testID="licence-key-redeem" accessibilityRole="button" disabled={busy || !key.trim() || result?.ok === true} onPress={() => void redeem()} style={[styles.btn, { backgroundColor: theme.ctaFill }, (busy || !key.trim()) && styles.dim]}>
              <Text style={[styles.btnText, { color: theme.ctaText }]}>{t("paywall.key.redeem")}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center", padding: 24 },
  sheet: { width: "100%", maxWidth: 480, borderWidth: 1, borderRadius: radius.card, padding: 18, gap: 12 },
  title: { ...font("sans", "600"), fontSize: 18 },
  input: { ...font("mono"), fontSize: 13, borderWidth: 1, borderRadius: radius.control, padding: 10, minHeight: 72 },
  body: { ...font("sans"), fontSize: 14, lineHeight: 19 },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: 10 },
  btn: { minHeight: 40, paddingHorizontal: 16, borderRadius: radius.control, alignItems: "center", justifyContent: "center" },
  btnText: { ...font("sans", "500"), fontSize: 15 },
  dim: { opacity: 0.5 },
});
