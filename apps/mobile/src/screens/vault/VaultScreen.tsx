import { useCallback, useEffect, useState } from "react";
import { Modal, Pressable, SectionList, StyleSheet, Switch, Text, View, useColorScheme } from "react-native";
import { File, Paths } from "expo-file-system";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { dark, light, fonts, radius } from "@inborn/ui";
import { ENGINE_VERSION, formatBytes, groupByFit, type CatalogModel } from "@inborn/core";
import { resetEngine } from "../../engine";
import { useGgufOpenHandler, useVault, type VaultEntry } from "../../vault";
import { DEV_AUTOIMPORT, DEV_AUTOINSTALL, devBuild } from "../../vault/devFlags";
import { ModelCard } from "./ModelCard";
import { ModelDetails } from "./ModelDetails";

export interface VaultScreenProps {
  onClose: () => void;
  /** Called after the default model changed and the engine was reset; the host remounts the chat screen. */
  onModelChanged?: (modelId: string) => void;
}

type Section = { key: string; title: string; data: VaultEntry[]; disabled?: Map<string, "ram" | "engine"> };
type Confirm = { entry: VaultEntry };

/** S30 Model vault (spec §8.4): what is installed, what fits this device, download / import / remove. */
export function VaultScreen({ onClose, onModelChanged }: VaultScreenProps) {
  const { t } = useTranslation();
  const theme = useColorScheme() === "light" ? light : dark;
  const insets = useSafeAreaInsets();
  const { vault, entries } = useVault();
  const [details, setDetails] = useState<CatalogModel | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const device = vault.device;
  const active = vault.activeModel();
  const recommendedId = vault.recommendedId();


  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  const importUri = useCallback(
    async (uri: string, name?: string) => {
      const r = await vault.importFile(uri, name);
      if (r.ok) setToast(t("vault.import.ok", { name: r.model.name }));
      else {
        const key = { "not-gguf": "vault.import.notGguf", truncated: "vault.import.truncated", "unsupported-arch": "vault.import.unsupportedArch", "engine-too-old": "vault.import.engineTooOld", "no-space": "vault.import.noSpace", "copy-failed": "vault.import.copyFailed" }[r.reason];
        setToast(t(key, { arch: "?" }));
      }
    },
    [vault, t],
  );
  useGgufOpenHandler(useCallback((url: string) => void importUri(url), [importUri]));

  useEffect(() => {
    void vault.ready().then(async () => {
      if (!devBuild()) return;
      if (DEV_AUTOINSTALL && vault.state(DEV_AUTOINSTALL).kind !== "ready") void vault.install(DEV_AUTOINSTALL);
      for (const name of DEV_AUTOIMPORT) await importUri(new File(Paths.document, name).uri);
    });
  }, [vault, importUri]);

  const pickAndImport = async () => {
    try {
      const picked = await File.pickFileAsync({ multipleFiles: false });
      if (!picked.canceled) await importUri(picked.result.uri, picked.result.name);
    } catch (e: unknown) {
      console.warn("[vault] pick", e);
    }
  };

  const use = async (id: string) => {
    vault.setDefault(id);
    await resetEngine();
    onModelChanged?.(id);
  };

  const startInstall = (entry: VaultEntry) => {
    setConfirm(null);
    void vault.install(entry.model.id);
  };

  const groups = groupByFit(
    entries.map((e) => e.model),
    device,
    ENGINE_VERSION,
  );
  const byId = new Map(entries.map((e) => [e.model.id, e]));
  const installed = (e: VaultEntry | undefined) => e && (e.state.kind === "ready" || e.state.kind === "quarantined" || e.state.kind === "delivering" || e.state.kind === "verifying");
  const onDevice = entries.filter((e) => installed(e));
  const fits = groups.fits.map((m) => byId.get(m.id)!).filter((e) => !installed(e));
  const tooBig = groups.tooBig.map((x) => byId.get(x.model.id)!).filter((e) => !installed(e));
  const companions = entries.filter((e) => e.model.role !== "chat" && !installed(e));
  const sections: Section[] = [
    { key: "on", title: t("vault.onDevice"), data: onDevice },
    ...(fits.length ? [{ key: "fits", title: t("vault.fits", { device: t(`vault.device.${device.deviceClass}`) }), data: fits }] : []),
    ...(tooBig.length ? [{ key: "big", title: t("vault.tooBig", { ram: device.ramGB }), data: tooBig, disabled: new Map(groups.tooBig.map((x) => [x.model.id, x.reason])) }] : []),
    ...(companions.length ? [{ key: "companions", title: t("vault.companions"), data: companions }] : []),
  ];

  const detailsState = details ? vault.state(details.id) : { kind: "not-installed" as const };

  return (
    <View style={[styles.root, { backgroundColor: theme.bg, paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <Pressable testID="close-vault" accessibilityRole="button" accessibilityLabel={t("vault.close")} onPress={onClose} hitSlop={8} style={styles.headerBtn}>
          <Text style={[styles.headerGlyph, { color: theme.text2 }]}>✕</Text>
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>{t("vault.title")}</Text>
        <View style={styles.headerBtn} />
      </View>
      <Text testID="vault-storage" style={[styles.mono, styles.centered, { color: theme.text3 }]}>
        {t("vault.storage", { used: formatBytes(vault.storageUsedBytes()), free: formatBytes(vault.freeDiskBytes()) })} · {t("onboarding.runsOn", { chip: device.chip.toUpperCase(), ram: `${device.ramGB} GB` })}
      </Text>
      {vault.manifestStatus.ok ? null : (
        <Text testID="manifest-warning" style={[styles.mono, styles.centered, { color: theme.danger }]}>
          {t("vault.manifest.bad")}
        </Text>
      )}
      <SectionList
        sections={sections}
        keyExtractor={(e) => e.model.id}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={styles.list}
        renderSectionHeader={({ section }) => <Text style={[styles.monoLabel, styles.sectionHeader, { color: theme.text3 }]}>{section.title}</Text>}
        renderItem={({ item, section }) => (
          <ModelCard
            model={item.model}
            state={item.state}
            plan={item.plan}
            device={device}
            theme={theme}
            recommended={item.model.id === recommendedId}
            active={active?.model.id === item.model.id}
            disabledReason={section.disabled?.get(item.model.id)}
            onInstall={() => setConfirm({ entry: item })}
            onCancel={() => void vault.cancel(item.model.id)}
            onPause={() => void vault.pause(item.model.id)}
            onResume={() => void vault.resume(item.model.id)}
            onUse={() => void use(item.model.id)}
            onDetails={() => setDetails(item.model)}
          />
        )}
        ListFooterComponent={
          <View style={styles.footer}>
            <Pressable testID="import-gguf" accessibilityRole="button" onPress={() => void pickAndImport()} style={[styles.action, { backgroundColor: theme.surface2, borderColor: theme.border }]}>
              <Text style={[styles.actionText, { color: theme.text }]}>⇪ {t("vault.import")}</Text>
            </Pressable>
            {device.os === "android" ? <Text style={[styles.mono, styles.centered, { color: theme.text3 }]}>{t("vault.import.hint.android")}</Text> : null}
          </View>
        }
      />
      {toast ? (
        <View testID="vault-toast" style={[styles.toast, { backgroundColor: theme.surface2, borderColor: theme.border, bottom: insets.bottom + 16 }]}>
          <Text style={[styles.body, { color: theme.text }]}>{toast}</Text>
        </View>
      ) : null}

      <Modal visible={confirm !== null} transparent animationType="slide" onRequestClose={() => setConfirm(null)}>
        <Pressable style={styles.backdrop} onPress={() => setConfirm(null)} />
        <View style={[styles.sheet, { backgroundColor: theme.surface1, borderColor: theme.border, paddingBottom: insets.bottom + 20 }]}>
          <Text style={[styles.title, { color: theme.text }]}>{t("vault.confirm.title", { name: confirm?.entry.model.name ?? "" })}</Text>
          <Text testID="confirm-text" style={[styles.body, { color: theme.text2 }]}>
            {confirm?.entry.plan?.via === "play"
              ? t("vault.confirm.play", { size: formatBytes(confirm.entry.model.bytes) })
              : t("vault.confirm.https", { size: formatBytes(confirm?.entry.model.bytes ?? 0), host: confirm?.entry.plan?.host ?? "" })}
          </Text>
          {confirm?.entry.plan?.via === "https" ? (
            <View style={styles.switchRow}>
              <Text style={[styles.body, { color: theme.text }]}>{t("vault.confirm.wifiOnly")}</Text>
              <Switch testID="wifi-only" value={vault.wifiOnly()} onValueChange={(v) => vault.setWifiOnly(v)} trackColor={{ true: theme.text2, false: theme.border }} />
            </View>
          ) : null}
          <View style={styles.sheetActions}>
            <Pressable accessibilityRole="button" onPress={() => setConfirm(null)} style={styles.textBtn}>
              <Text style={[styles.body, { color: theme.text2 }]}>{t("vault.cancel")}</Text>
            </Pressable>
            <Pressable testID="confirm-download" accessibilityRole="button" onPress={() => confirm && startInstall(confirm.entry)} style={[styles.cta, { backgroundColor: theme.ctaFill }]}>
              <Text style={[styles.body, styles.strong, { color: theme.ctaText }]}>{t("vault.confirm.go")}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <ModelDetails
        model={details}
        state={detailsState}
        theme={theme}
        active={!!details && active?.model.id === details.id}
        isDefault={!!details && vault.defaultModelId() === details.id}
        onClose={() => setDetails(null)}
        onSetDefault={() => {
          if (details) void use(details.id);
          setDetails(null);
        }}
        onDelete={() => {
          if (details) void vault.remove(details.id);
          setDetails(null);
        }}
      />
    </View>
  );
}

const fill = { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 } as const;

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, height: 44 },
  headerBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  headerGlyph: { fontSize: 18 },
  title: { fontFamily: fonts.sans, fontSize: 22, fontWeight: "600", letterSpacing: -0.2 },
  mono: { fontFamily: fonts.mono, fontSize: 11, letterSpacing: 0.4 },
  monoLabel: { fontFamily: fonts.mono, fontSize: 11, fontWeight: "500", letterSpacing: 0.9, textTransform: "uppercase" },
  centered: { textAlign: "center", paddingHorizontal: 16, paddingTop: 4 },
  sectionHeader: { paddingTop: 14, paddingBottom: 8 },
  list: { paddingHorizontal: 16, paddingBottom: 96 },
  footer: { gap: 8, paddingTop: 12 },
  action: { height: 44, borderWidth: 1, borderRadius: radius.control, alignItems: "center", justifyContent: "center" },
  actionText: { fontFamily: fonts.sans, fontSize: 16, fontWeight: "500" },
  body: { fontFamily: fonts.sans, fontSize: 16, lineHeight: 22 },
  strong: { fontWeight: "600" },
  toast: { position: "absolute", left: 16, right: 16, paddingHorizontal: 16, paddingVertical: 12, borderWidth: 1, borderRadius: radius.control },
  backdrop: { ...fill, backgroundColor: "rgba(0,0,0,0.45)" },
  sheet: { position: "absolute", left: 0, right: 0, bottom: 0, padding: 20, gap: 16, borderTopWidth: 1, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 16 },
  sheetActions: { flexDirection: "row", justifyContent: "flex-end", alignItems: "center", gap: 8 },
  textBtn: { minHeight: 44, paddingHorizontal: 16, justifyContent: "center" },
  cta: { minHeight: 44, paddingHorizontal: 20, borderRadius: radius.control, alignItems: "center", justifyContent: "center" },
});
