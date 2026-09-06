import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { radius, type Theme } from "@inborn/ui";
import { formatModelBytes, type CatalogModel, type InstallState } from "@inborn/core";
import { font, useType } from "../../services/type";

export interface ModelDetailsProps {
  model: CatalogModel | null;
  state: InstallState;
  theme: Theme;
  active: boolean;
  isDefault: boolean;
  onClose: () => void;
  onSetDefault: () => void;
  onDelete: () => void;
}

/** S31: everything about one model (spec §8.4). Numbers live here, not on the cartridge. */
export function ModelDetails({ model, state, theme, active, isDefault, onClose, onSetDefault, onDelete }: ModelDetailsProps) {
  const type = useType();
  const { t } = useTranslation();
  const installed = state.kind === "ready" || state.kind === "quarantined";
  const rows: [string, string][] = model
    ? [
        [t("vault.details.params"), model.params],
        [t("vault.details.quant"), model.quant],
        [t("vault.details.context"), model.contextLength ? t("vault.details.tokens", { count: model.contextLength }) : "—"],
        [t("vault.details.vision"), t(model.vision ? "vault.yes" : "vault.no")],
        [t("vault.details.tools"), t(model.tools ? "vault.yes" : "vault.no")],
        [t("vault.details.languages"), model.goodLanguages.length ? model.goodLanguages.join(", ") : "—"],
        [t("vault.details.license"), model.license],
        [t("vault.details.source"), installed ? t(`vault.source.${state.via}`) : model.delivery.map((d) => d.kind).join(", ")],
        [t("vault.details.sha"), installed ? state.sha256 : model.sha256],
        ...(installed ? [[t("vault.details.path"), state.path] as [string, string]] : []),
      ]
    : [];
  return (
    <Modal visible={model !== null} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { backgroundColor: theme.surface1, borderColor: theme.border }]}>
        <Text style={[type.title, { color: theme.text }]}>
          {model?.name} · {model?.family} {model?.params}
        </Text>
        <Text style={[type.mono, { color: theme.text3 }]}>
          {model ? formatModelBytes(model.bytes) : ""} · {model?.arch}
        </Text>
        <ScrollView style={styles.table} contentContainerStyle={{ gap: 8 }}>
          {rows.map(([k, v]) => (
            <View key={k} style={styles.row}>
              <Text style={[type.mono, type.monoLabel, { color: theme.text3 }]}>{k.toUpperCase()}</Text>
              <Text selectable style={[type.mono, { color: theme.text }]}>
                {v}
              </Text>
            </View>
          ))}
        </ScrollView>
        <View style={styles.actions}>
          {installed && !isDefault ? (
            <Pressable testID="details-set-default" accessibilityRole="button" onPress={onSetDefault} style={[styles.cta, { backgroundColor: theme.ctaFill }]}>
              <Text style={[type.body, styles.body, { color: theme.ctaText }]}>{t("vault.details.setDefault")}</Text>
            </Pressable>
          ) : null}
          {installed ? (
            state.via === "bundled" ? (
              <Text style={[type.mono, { color: theme.text3 }]}>{t("vault.state.bundled")}</Text>
            ) : active ? (
              <Text style={[type.mono, { color: theme.text3 }]}>{t("vault.details.deleteBlocked")}</Text>
            ) : (
              <Pressable testID="details-delete" accessibilityRole="button" onPress={onDelete} style={styles.textBtn}>
                <Text style={[type.body, styles.body, { color: theme.danger }]}>{t("vault.remove")}</Text>
              </Pressable>
            )
          ) : null}
          <Pressable accessibilityRole="button" onPress={onClose} style={styles.textBtn}>
            <Text style={[type.body, styles.body, { color: theme.text2 }]}>{t("vault.close")}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.45)" },
  sheet: { position: "absolute", left: 0, right: 0, bottom: 0, maxHeight: "80%", padding: 20, paddingBottom: 32, gap: 10, borderTopWidth: 1, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  table: { flexGrow: 0 },
  row: { gap: 2 },
  body: { ...font("sans", "500") },
  actions: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "flex-end", gap: 8 },
  cta: { minHeight: 44, paddingHorizontal: 16, borderRadius: radius.control, alignItems: "center", justifyContent: "center" },
  textBtn: { minHeight: 44, paddingHorizontal: 12, justifyContent: "center" },
});
