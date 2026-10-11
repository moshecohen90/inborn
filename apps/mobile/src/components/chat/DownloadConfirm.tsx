import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BUNDLED_MANIFEST, findModel, formatModelBytes } from "@inborn/core";
import { radius, type Theme } from "@inborn/ui";
import { AppModal } from "../shell/AppModal";
import { GlassFill, panelColor, panelStyle } from "../shell/NativeChrome";
import { modelName } from "../../lib/models";
import { offlineKey } from "../../lib/offlineWording";
import { useOffline } from "../../lib/useOffline";
import { useOpenSheet } from "../../lib/openSheets";
import { useType } from "../../services/type";

const catalogHost = (): string => {
  try {
    return new URL(BUNDLED_MANIFEST.baseUrl).hostname;
  } catch {
    return "";
  }
};

export interface PendingDownload {
  /** Catalog id the sheet is titled with (the model a path switches to, or the pack itself). */
  id: string;
  bytes: number;
  run: () => void;
}

/** The vault's "Download X?" sheet (size, Cancel, Download) for a download a chat card is about to start. */
export function DownloadConfirm({ pending, theme, onClose }: { pending: PendingDownload | null; theme: Theme; onClose: () => void }) {
  const type = useType();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const offline = useOffline();
  useOpenSheet(pending !== null, onClose);
  const model = pending ? findModel(BUNDLED_MANIFEST, pending.id) : undefined;
  const size = formatModelBytes(pending?.bytes ?? 0);
  return (
    <AppModal visible={pending !== null} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, panelStyle, { backgroundColor: panelColor(theme.surface1), borderColor: theme.border, paddingBottom: insets.bottom + 20 }]}>
        <GlassFill />
        <Text style={[type.title, { color: theme.text }]}>{t("vault.confirm.title", { name: model ? modelName(t, model) : "" })}</Text>
        <Text testID="confirm-text" style={[type.body, { color: theme.text2 }]}>
          {Platform.OS === "android" ? t("vault.confirm.play", { size }) : t("vault.confirm.https", { size, host: catalogHost() })}
        </Text>
        {offline ? (
          <Text testID="confirm-offline" style={[type.body, { color: theme.text }]}>
            {t(offlineKey("vault.confirm.offline"))}
          </Text>
        ) : null}
        <View style={styles.actions}>
          <Pressable testID="confirm-cancel" accessibilityRole="button" onPress={onClose} style={styles.textBtn}>
            <Text style={[type.body, { color: theme.text2 }]}>{t("vault.cancel")}</Text>
          </Pressable>
          <Pressable
            testID="confirm-download"
            accessibilityRole="button"
            onPress={() => {
              const run = pending?.run;
              onClose();
              run?.();
            }}
            style={[styles.cta, { backgroundColor: theme.ctaFill }]}
          >
            <Text style={[type.body, type.strong, { color: theme.ctaText }]}>{t("vault.confirm.go")}</Text>
          </Pressable>
        </View>
      </View>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  backdrop: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.45)" },
  sheet: { position: "absolute", left: 0, right: 0, bottom: 0, padding: 20, gap: 16, borderTopWidth: 1, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  actions: { flexDirection: "row", justifyContent: "flex-end", alignItems: "center", gap: 8 },
  textBtn: { minHeight: 44, paddingHorizontal: 16, justifyContent: "center" },
  cta: { minHeight: 44, paddingHorizontal: 20, borderRadius: radius.control, alignItems: "center", justifyContent: "center" },
});
