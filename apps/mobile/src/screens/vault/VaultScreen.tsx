import { useCallback, useEffect, useState } from "react";
import { Modal, Pressable, SectionList, StyleSheet, Text, View, useColorScheme } from "react-native";
import { File, Paths } from "expo-file-system";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon, dark, light, radius } from "@inborn/ui";
import { GlassFill, panelColor, panelStyle } from "../../components/shell/NativeChrome";
import { ENGINE_VERSION, formatModelBytes, groupByFit, paywallFor, type CatalogModel } from "@inborn/core";
import { useEntitlement } from "../../licence";
import { resetEngine } from "../../engine";
import { useGgufOpenHandler, useVault, type VaultEntry } from "../../vault";
import { DEV_AUTOIMPORT, DEV_AUTOINSTALL, DEV_VAULT_FILE, devBuild } from "../../vault/devFlags";
import { ModelCard } from "./ModelCard";
import { ModelDetails } from "./ModelDetails";
import { font, useType } from "../../services/type";
import { Toggle } from "../../components/shell/primitives";

export interface VaultScreenProps {
  onClose: () => void;
  /** Called after the default model changed and the engine was reset; the host remounts the chat screen. */
  onModelChanged?: (modelId: string) => void;
  /** Installing a Pro-only model (Sharp) is a §12.3 value moment: the paywall opens instead of the download sheet. */
  onUnlock?: () => void;
}

type Section = { key: string; title: string; data: VaultEntry[]; disabled?: Map<string, "ram" | "engine"> };
type Confirm = { entry: VaultEntry };

/** S30 Model vault (spec §8.4): what is installed, what fits this device, download / import / remove. */
export function VaultScreen({ onClose, onModelChanged, onUnlock }: VaultScreenProps) {
  const type = useType();
  const { t } = useTranslation();
  const theme = useColorScheme() === "light" ? light : dark;
  const insets = useSafeAreaInsets();
  const { vault, entries } = useVault();
  const { tier } = useEntitlement();
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

  useEffect(() => {
    const commandFile = DEV_VAULT_FILE;
    if (!commandFile || !devBuild()) return;
    const timer = setInterval(() => {
      const file = new File(Paths.document, commandFile);
      if (!file.exists) return;
      const lines = file.textSync().split("\n");
      file.delete();
      for (const line of lines) {
        const [cmd, arg, name] = line.trim().split(/\s+/);
        if (!cmd || !arg) continue;
        if (cmd === "install") void vault.install(arg);
        else if (cmd === "use") void use(arg);
        else if (cmd === "remove") void vault.remove(arg);
        else if (cmd === "import") void importUri(arg, name);
      }
    }, 1500);
    return () => clearInterval(timer);
  }, [vault, importUri]);

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
          <Icon name="x" size={20} color={theme.text2} />
        </Pressable>
        <Text style={[type.title, { color: theme.text }]}>{t("vault.title")}</Text>
        <View style={styles.headerBtn} />
      </View>
      <Text testID="vault-storage" style={[type.mono, styles.centered, { color: theme.text3 }]}>
        {t("vault.storage", { used: formatModelBytes(vault.storageUsedBytes()), free: formatModelBytes(vault.freeDiskBytes()) })} · {t("onboarding.runsOn", { chip: device.chip.toUpperCase(), ram: `${device.ramGB} GB` })}
      </Text>
      {vault.manifestStatus.ok ? null : (
        <Text testID="manifest-warning" style={[type.mono, styles.centered, { color: theme.danger }]}>
          {t("vault.manifest.bad")}
        </Text>
      )}
      <SectionList
        sections={sections}
        keyExtractor={(e) => e.model.id}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={styles.list}
        renderSectionHeader={({ section }) => <Text style={[type.monoLabel, styles.sectionHeader, { color: theme.text3 }]}>{section.title}</Text>}
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
            onInstall={() => (paywallFor(tier, { kind: "model", proOnly: !!item.model.proOnly }) ? onUnlock?.() : setConfirm({ entry: item }))}
            onCancel={() => void vault.cancel(item.model.id)}
            onPause={() => void vault.pause(item.model.id)}
            onResume={() => void vault.resume(item.model.id)}
            onUse={() => void use(item.model.id)}
            onDetails={() => setDetails(item.model)}
            stray={!!item.stray}
            onRemove={() => void vault.remove(item.model.id)}
          />
        )}
        ListFooterComponent={
          <View style={styles.footer}>
            <Pressable testID="import-gguf" accessibilityRole="button" onPress={() => void pickAndImport()} style={[styles.action, { backgroundColor: theme.surface2, borderColor: theme.border }]}>
              <Icon name="upload" size={18} color={theme.text} />
              <Text style={[type.body, styles.actionText, { color: theme.text }]}>{t("vault.import")}</Text>
            </Pressable>
            {device.os === "android" ? <Text style={[type.mono, styles.centered, { color: theme.text3 }]}>{t("vault.import.hint.android")}</Text> : null}
          </View>
        }
      />
      {toast ? (
        <View testID="vault-toast" style={[styles.toast, { backgroundColor: theme.surface2, borderColor: theme.border, bottom: insets.bottom + 16 }]}>
          <Text style={[type.body, { color: theme.text }]}>{toast}</Text>
        </View>
      ) : null}

      <Modal visible={confirm !== null} transparent animationType="slide" onRequestClose={() => setConfirm(null)}>
        <Pressable style={styles.backdrop} onPress={() => setConfirm(null)} />
        <View style={[styles.sheet, panelStyle, { backgroundColor: panelColor(theme.surface1), borderColor: theme.border, paddingBottom: insets.bottom + 20 }]}>
          <GlassFill />
          <Text style={[type.title, { color: theme.text }]}>{t("vault.confirm.title", { name: confirm?.entry.model.name ?? "" })}</Text>
          <Text testID="confirm-text" style={[type.body, { color: theme.text2 }]}>
            {confirm?.entry.plan?.via === "play"
              ? t("vault.confirm.play", { size: formatModelBytes(confirm.entry.model.bytes) })
              : t("vault.confirm.https", { size: formatModelBytes(confirm?.entry.model.bytes ?? 0), host: confirm?.entry.plan?.host ?? "" })}
          </Text>
          {confirm?.entry.plan?.via === "https" ? (
            <View style={styles.switchRow}>
              <Text style={[type.body, { color: theme.text }]}>{t("vault.confirm.wifiOnly")}</Text>
              <Toggle testID="wifi-only" value={vault.wifiOnly()} onChange={(v) => vault.setWifiOnly(v)} />
            </View>
          ) : null}
          <View style={styles.sheetActions}>
            <Pressable accessibilityRole="button" onPress={() => setConfirm(null)} style={styles.textBtn}>
              <Text style={[type.body, { color: theme.text2 }]}>{t("vault.cancel")}</Text>
            </Pressable>
            <Pressable testID="confirm-download" accessibilityRole="button" onPress={() => confirm && startInstall(confirm.entry)} style={[styles.cta, { backgroundColor: theme.ctaFill }]}>
              <Text style={[type.body, type.strong, { color: theme.ctaText }]}>{t("vault.confirm.go")}</Text>
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
  centered: { textAlign: "center", paddingHorizontal: 16, paddingTop: 4 },
  sectionHeader: { paddingTop: 14, paddingBottom: 8 },
  list: { paddingHorizontal: 16, paddingBottom: 96 },
  footer: { gap: 8, paddingTop: 12 },
  action: { height: 44, borderWidth: 1, borderRadius: radius.control, flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center" },
  actionText: { ...font("sans", "500") },
  toast: { position: "absolute", left: 16, right: 16, paddingHorizontal: 16, paddingVertical: 12, borderWidth: 1, borderRadius: radius.control },
  backdrop: { ...fill, backgroundColor: "rgba(0,0,0,0.45)" },
  sheet: { position: "absolute", left: 0, right: 0, bottom: 0, padding: 20, gap: 16, borderTopWidth: 1, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 16 },
  sheetActions: { flexDirection: "row", justifyContent: "flex-end", alignItems: "center", gap: 8 },
  textBtn: { minHeight: 44, paddingHorizontal: 16, justifyContent: "center" },
  cta: { minHeight: 44, paddingHorizontal: 20, borderRadius: radius.control, alignItems: "center", justifyContent: "center" },
});
