import { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { extensions, formatModelBytes, type Extension } from "@inborn/core";
import { MIN_TOUCH, radius, type Theme } from "@inborn/ui";
import { extKey, vaultRowState } from "../extensions/card";
import { offeredChatModels } from "../extensions/chatModel";
import { canRemoveExtensions, cancelExtension, installExtension, refreshExtension, removeExtension } from "../extensions/store";
import { useExtension } from "../extensions/useExtension";
import { useType } from "../services/type";

/* A browser never offers Sharp, so it must not list Sharp's pack. */
function listedHere(): Extension[] {
  const offered = new Set(offeredChatModels(true).map((m) => m.id));
  return extensions().filter((e) => !e.appliesTo.models || e.appliesTo.models.some((m) => offered.has(m)));
}

/** Round 105: the vault's one list of extensions, every registry entry with its size, its state and its one action. */
export function ExtensionsSection({ theme }: { theme: Theme }) {
  const type = useType();
  const { t } = useTranslation();
  const list = listedHere();
  useEffect(() => {
    for (const e of listedHere()) void refreshExtension(e.id).catch(() => undefined);
  }, []);
  return (
    <View testID="vault-extensions" style={styles.section}>
      <Text accessibilityRole="header" style={[type.monoLabel, { color: theme.text3 }]}>
        {t("extensions.section").toUpperCase()}
      </Text>
      <Text style={[type.bodySmall, { color: theme.text2 }]}>{t("extensions.onDemand")}</Text>
      {list.map((e) => (
        <ExtensionRow key={e.id} ext={e} theme={theme} />
      ))}
    </View>
  );
}

function ExtensionRow({ ext, theme }: { ext: Extension; theme: Theme }) {
  const type = useType();
  const { t } = useTranslation();
  const state = useExtension(ext.id);
  const size = formatModelBytes(ext.bytes);
  const line = vaultRowState(state, size);
  const action =
    state.kind === "missing" || state.kind === "failed"
      ? { id: `ext-download-${ext.id}`, label: t("extensions.download", { size }), run: () => void installExtension(ext.id).catch(() => undefined), cta: true }
      : state.kind === "downloading"
        ? { id: `ext-cancel-${ext.id}`, label: t("vault.cancel"), run: () => cancelExtension(ext.id), cta: false }
        : state.kind === "ready" && !state.bundled && canRemoveExtensions
          ? { id: `ext-remove-${ext.id}`, label: t("extensions.remove"), run: () => void removeExtension(ext.id).catch(() => undefined), cta: false }
          : null;
  return (
    <View testID={`ext-row-${ext.id}`} style={[styles.row, { borderColor: theme.border, backgroundColor: theme.surface1 }]}>
      <Text style={[type.body, type.strong, { color: theme.text }]}>{t(extKey(ext, "name"))}</Text>
      <Text style={[type.bodySmall, { color: theme.text2 }]}>{t(extKey(ext, "vault"))}</Text>
      <Text testID={`ext-state-${ext.id}`} style={[type.bodySmall, { color: state.kind === "failed" ? theme.danger : theme.text3 }]}>
        {t(line.key, line.params)}
      </Text>
      {action ? (
        <Pressable testID={action.id} accessibilityRole="button" onPress={action.run} style={[styles.btn, action.cta ? { backgroundColor: theme.ctaFill } : { borderWidth: 1, borderColor: theme.border }]}>
          <Text numberOfLines={1} style={[type.bodySmall, type.strong, { color: action.cta ? theme.ctaText : theme.text }]}>
            {action.label}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 8 },
  row: { borderWidth: 1, borderRadius: radius.card, padding: 12, gap: 4 },
  btn: { alignSelf: "flex-start", minHeight: MIN_TOUCH, paddingHorizontal: 12, marginTop: 4, borderRadius: radius.control, alignItems: "center", justifyContent: "center", maxWidth: "100%" },
});
