import { useCallback, useEffect, useRef, useState } from "react";
import { modelName } from "../../lib/models";
import { FOCUS_FLASH_MS, FOCUS_SETTLE_MS, focusScrollTarget } from "./focus";
import { Modal, Platform, Pressable, SectionList, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../../services/theme";
import { File, Paths } from "expo-file-system";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon, radius } from "@inborn/ui";
import { GlassFill, panelColor, panelStyle } from "../../components/shell/NativeChrome";
import { BannerSpacer } from "../../components/shell/bannerInset";
import { BENCH_PP, BENCH_TG, ENGINE_VERSION, FIT_LANGUAGES, LANGUAGE_NAME_BY_CODE, USE_CASES, benchmarkKey, expectedSpeed, formatModelBytes, deviceRecommendation, groupByFit, parseBenchmark, paywallFor, rankModels, recommendationIsWeak, type BenchmarkResult, type CatalogModel, type UseCase , type PaywallReason } from "@inborn/core";
import { Sheet, SheetItem } from "../../components/chat/Sheet";
import { useEntitlement } from "../../licence";
import { benchmarkModel, resetEngine } from "../../engine";
import { useAppServices } from "../../services/AppServices";
import { useGgufOpenHandler, useVault, type VaultEntry } from "../../vault";
import { DEV_AUTOIMPORT, DEV_AUTOINSTALL, DEV_VAULT_FILE, devBuild } from "../../vault/devFlags";
import { ModelCard } from "./ModelCard";
import { ModelDetails } from "./ModelDetails";
import { HfSearch } from "./HfSearch";
import { hfSearchAvailable } from "../../vault/hf";
import { chooseFile } from "../../documents/chooseFile";
import { font, useType } from "../../services/type";
import { deviceNoun } from "../../lib/deviceNoun";
import { listClipping } from "../../lib/listClipping";
import { useContentMaxWidth } from "../../lib/useLayout";
import { Toggle } from "../../components/shell/primitives";
import { useOpenSheet } from "../../lib/openSheets";
import { afterSheetClose } from "../../lib/sheetHandover";

export interface VaultScreenProps {
  onClose: () => void;
  /** Called after the default model changed and the engine was reset; the host remounts the chat screen. */
  onModelChanged?: (modelId: string) => void;
  /** Installing a Pro-only model (Sharp) is a §12.3 value moment: the paywall opens instead of the download sheet. */
  onUnlock?: (reason: PaywallReason) => void;
  /** Catalog id of the card to scroll to and mark: every "install X" entry point lands on X, not on the top of the list. */
  focus?: string;
}

type Section = { key: string; title: string; data: VaultEntry[]; disabled?: Map<string, "ram" | "engine"> };

/* The headless hooks run once per app run, not on every vault mount (a remount re-imported the loaded model over itself). */
let devHooksRan = false;
type Confirm = { entry: VaultEntry };

/** The "Best for" language picker starts on the app language when the catalog rates it, else English. */
const startLanguage = (locale: string): string => {
  const base = locale.split("-")[0]?.toLowerCase() ?? "en";
  return FIT_LANGUAGES.includes(base) ? base : "en";
};

/** S30 Model vault (spec §8.4): what is installed, what fits this device, download / import / remove. */
export function VaultScreen({ onClose, onModelChanged, onUnlock, focus }: VaultScreenProps) {
  const type = useType();
  const { t, i18n } = useTranslation();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const contentMax = useContentMaxWidth();
  const { vault, entries } = useVault();
  const [bestUse, setBestUse] = useState<UseCase>("chat");
  const [bestLanguage, setBestLanguage] = useState(() => startLanguage(i18n.language));
  const [picker, setPicker] = useState<"use" | "language" | null>(null);
  const { tier } = useEntitlement();
  const [details, setDetails] = useState<CatalogModel | null>(null);
  const [benchmark, setBenchmark] = useState<BenchmarkResult | null>(null);
  const [benchmarking, setBenchmarking] = useState(false);
  const { store, prefs, updatePrefs } = useAppServices();
  const { library } = store;
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [hfOpen, setHfOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const device = vault.device;
  const active = vault.activeModel();

  useEffect(() => vault.recheckSpace(), [vault]);

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
      vault.requestKnownPacks();
      if (!devBuild() || devHooksRan) return;
      devHooksRan = true;
      if (DEV_AUTOINSTALL && vault.state(DEV_AUTOINSTALL).kind !== "ready") void vault.install(DEV_AUTOINSTALL);
      for (const name of DEV_AUTOIMPORT) await importUri(new File(Paths.document, name).uri);
    });
  }, [vault, importUri]);

  const pickAndImport = async () => {
    try {
      const picked = await chooseFile();
      if (picked) await importUri(picked.uri, picked.name);
    } catch (e: unknown) {
      console.warn("[vault] pick", e);
    }
  };

  const use = async (id: string) => {
    vault.setDefault(id);
    await resetEngine();
    onModelChanged?.(id);
  };

  /* S31: the stored result of the model whose details are open (one per model, in the encrypted settings table). */
  useEffect(() => {
    if (!details) return;
    let alive = true;
    setBenchmark(null);
    library
      .getSetting(benchmarkKey(details.id))
      .then((raw) => {
        if (alive) setBenchmark(parseBenchmark(raw));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [details, library]);

  const runBenchmark = async (model: CatalogModel) => {
    const loc = vault.locate(model.id);
    if (!loc || benchmarking) return;
    setBenchmarking(true);
    try {
      const run = await benchmarkModel({ id: model.id, uri: loc.path }, BENCH_PP, BENCH_TG);
      if (!run) {
        setToast(t("vault.benchmark.unavailable"));
        return;
      }
      const result: BenchmarkResult = { modelId: model.id, at: Date.now(), loadMs: run.loadMs, promptTokPerSec: run.timings.promptTokPerSec, genTokPerSec: run.timings.genTokPerSec, pp: BENCH_PP, tg: BENCH_TG, memMB: run.memMB, chip: device.chip };
      await library.setSetting(benchmarkKey(model.id), JSON.stringify(result));
      setBenchmark(result);
      if (__DEV__) console.log("[bench]", JSON.stringify({ ...result, expected: expectedSpeed(device.chip, model.tier) ?? null }));
    } catch (e: unknown) {
      console.warn("[bench]", e);
      setToast(t("vault.benchmark.failed"));
    } finally {
      setBenchmarking(false);
    }
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
  /* Hugging Face picks that are not on the device (cancelled, failed, waiting): they keep a row so Install / Remove stay reachable. */
  const hfPending = entries.filter((e) => e.hf && !installed(e));
  /* §7.8: the RECOMMENDED tag and the order inside each group follow the fit map for the chosen use + language on this device. */
  const ranked = rankModels({ use: bestUse, languageCode: bestLanguage, device, installed: entries.filter((e) => e.state.kind === "ready").map((e) => e.model.id), catalog: vault.manifest.models });
  const rankOf = new Map(ranked.map((r, i) => [r.model.id, i]));
  const byRank = (a: VaultEntry, b: VaultEntry) => (rankOf.get(a.model.id) ?? 99) - (rankOf.get(b.model.id) ?? 99);
  onDevice.sort(byRank);
  fits.sort(byRank);
  const top = deviceRecommendation({ use: bestUse, languageCode: bestLanguage, device, installed: [], catalog: vault.manifest.models });
  const recommendedId = top?.model.id;
  const recommendedWeak = !!top && recommendationIsWeak(top);
  const languageName = (code: string) => t(`language.${code}`, { defaultValue: LANGUAGE_NAME_BY_CODE[code] ?? code });
  const sections: Section[] = [
    { key: "on", title: t("vault.onDevice"), data: onDevice },
    ...(fits.length ? [{ key: "fits", title: t("vault.fits", { device: deviceNoun() }), data: fits }] : []),
    ...(hfPending.length ? [{ key: "hf", title: t("vault.hf.section"), data: hfPending }] : []),
    ...(tooBig.length ? [{ key: "big", title: t("vault.tooBig", { ram: device.ramGB }), data: tooBig, disabled: new Map(groups.tooBig.map((x) => [x.model.id, x.reason])) }] : []),
    ...(companions.length ? [{ key: "companions", title: t("vault.companions"), data: companions }] : []),
  ];

  /* A picked file joins the vault, then the same confirmation sheet as a catalog download names huggingface.co and the size (§5.1). */
  const pickFromHf = (model: CatalogModel) => {
    const entry = vault.addHfModel(model);
    setHfOpen(false);
    if (entry.state.kind === "ready") return setToast(t("vault.hf.alreadyInstalled", { name: model.name }));
    afterSheetClose(() => setConfirm({ entry }));
  };

  const detailsState = details ? vault.state(details.id) : { kind: "not-installed" as const };

  useOpenSheet(confirm !== null, () => setConfirm(null));
  const listRef = useRef<SectionList<VaultEntry, Section>>(null);
  const focused = focusScrollTarget(sections, focus);
  const focusedRef = useRef(focused);
  focusedRef.current = focused;
  /* A string, not the object: a re-render (Play pack state on Android) must not cancel the pending scroll (F373). */
  const focusKey = focused ? `${focus}@${focused.sectionIndex}:${focused.itemIndex}` : null;
  const settleUntil = useRef(0);
  const [flashId, setFlashId] = useState<string | null>(null);
  const scrollToFocus = useCallback(() => {
    const target = focusedRef.current;
    if (target && Date.now() < settleUntil.current) listRef.current?.scrollToLocation(target);
  }, []);
  useEffect(() => {
    if (!focusKey) return;
    settleUntil.current = Date.now() + FOCUS_SETTLE_MS;
    setFlashId(focus ?? null);
    const timers = [120, 450, 1100].map((ms) => setTimeout(scrollToFocus, ms));
    timers.push(setTimeout(() => setFlashId(null), FOCUS_FLASH_MS));
    return () => timers.forEach(clearTimeout);
  }, [focusKey, focus, scrollToFocus]);
  return (
    <View style={[styles.root, { backgroundColor: theme.bg, paddingTop: insets.top + 8 }]}>
      <View style={[styles.stack, { maxWidth: contentMax }]}>
      <View style={styles.header}>
        <Pressable testID="close-vault" accessibilityRole="button" accessibilityLabel={t("vault.close")} onPress={onClose} hitSlop={8} style={styles.headerBtn}>
          <Icon name="x" size={20} color={theme.text2} />
        </Pressable>
        <Text style={[type.title, { color: theme.text }]}>{t("vault.title")}</Text>
        <View style={styles.headerBtn} />
      </View>
      <BannerSpacer />
      <Text testID="vault-storage" style={[type.mono, styles.centered, { color: theme.text3 }]}>
        {t("vault.storage", { used: formatModelBytes(vault.storageUsedBytes()), free: formatModelBytes(vault.freeDiskBytes()) })} · {t("onboarding.runsOn", { chip: device.chip.toUpperCase(), ram: `${device.ramGB} GB` })}
      </Text>
      {vault.manifestStatus.ok ? null : (
        <Text testID="manifest-warning" style={[type.mono, styles.centered, { color: theme.danger }]}>
          {t("vault.manifest.bad")}
        </Text>
      )}
      <View testID="best-for" style={styles.bestFor}>
        <Text style={[type.monoLabel, { color: theme.text3 }]}>{t("vault.bestFor").toUpperCase()}</Text>
        <Pressable testID="best-for-use" accessibilityRole="button" onPress={() => setPicker("use")} style={[styles.pick, { backgroundColor: theme.surface2, borderColor: theme.border }]}>
          <Text style={[type.bodySmall, { color: theme.text }]}>{t(`use.${bestUse}`)}</Text>
          <Icon name="chevronDown" size={14} color={theme.text2} />
        </Pressable>
        <Pressable testID="best-for-language" accessibilityRole="button" onPress={() => setPicker("language")} style={[styles.pick, { backgroundColor: theme.surface2, borderColor: theme.border }]}>
          <Text style={[type.bodySmall, { color: theme.text }]}>{t("vault.bestFor.in", { language: languageName(bestLanguage) })}</Text>
          <Icon name="chevronDown" size={14} color={theme.text2} />
        </Pressable>
      </View>
      <SectionList
        ref={listRef}
        onScrollToIndexFailed={(info: { averageItemLength: number; index: number }) => {
          /* Rows below the rendered window: jump near it, then land exactly once they have been measured. */
          listRef.current?.getScrollResponder()?.scrollTo({ y: info.averageItemLength * info.index, animated: false });
          setTimeout(scrollToFocus, 300);
        }}
        onContentSizeChange={scrollToFocus}
        onScrollBeginDrag={() => {
          settleUntil.current = 0;
        }}
        {...listClipping}
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
            recommendedFor={{ use: bestUse, languageCode: bestLanguage, weak: recommendedWeak }}
            active={active?.model.id === item.model.id}
            highlighted={item.model.id === flashId}
            disabledReason={section.disabled?.get(item.model.id)}
            lockedForTier={paywallFor(tier, { kind: "model", proOnly: !!item.model.proOnly })}
            onInstall={() => (paywallFor(tier, { kind: "model", proOnly: !!item.model.proOnly }) ? onUnlock?.("model") : setConfirm({ entry: item }))}
            onCancel={() => void vault.cancel(item.model.id)}
            onPause={() => void vault.pause(item.model.id)}
            onResume={() => void vault.resume(item.model.id)}
            onUse={() => void use(item.model.id)}
            onDetails={() => setDetails(item.model)}
            stray={!!item.stray}
            onRemove={() => void vault.remove(item.model.id)}
            importOnly={item.importOnly}
            onImport={item.plan || item.imported || item.stray ? undefined : () => void pickAndImport()}
          />
        )}
        ListFooterComponent={
          <View style={styles.footer}>
            <Pressable testID="import-gguf" accessibilityRole="button" onPress={() => void pickAndImport()} style={[styles.action, { backgroundColor: theme.surface2, borderColor: theme.border }]}>
              <Icon name="upload" size={18} color={theme.text} />
              <Text style={[type.body, styles.actionText, { color: theme.text }]}>{t("vault.import")}</Text>
            </Pressable>
            {hfSearchAvailable() ? (
              <Pressable testID="search-hf" accessibilityRole="button" onPress={() => setHfOpen(true)} style={[styles.action, { backgroundColor: theme.surface2, borderColor: theme.border }]}>
                <Icon name="chevronRight" size={18} color={theme.text} />
                <Text style={[type.body, styles.actionText, { color: theme.text }]}>{t("vault.hf.button")}</Text>
              </Pressable>
            ) : null}
            {device.os === "android" || Platform.OS === "android" ? <Text style={[type.mono, styles.centered, { color: theme.text3 }]}>{t("vault.import.hint.android")}</Text> : null}
          </View>
        }
      />
      </View>
      {toast ? (
        <View testID="vault-toast" style={[styles.toast, { backgroundColor: theme.surface2, borderColor: theme.border, bottom: insets.bottom + 16 }]}>
          <Text style={[type.body, { color: theme.text }]}>{toast}</Text>
        </View>
      ) : null}

      <Modal visible={confirm !== null} transparent animationType="slide" onRequestClose={() => setConfirm(null)}>
        <Pressable style={styles.backdrop} onPress={() => setConfirm(null)} />
        <View style={[styles.sheet, panelStyle, { backgroundColor: panelColor(theme.surface1), borderColor: theme.border, paddingBottom: insets.bottom + 20 }]}>
          <GlassFill />
          <Text style={[type.title, { color: theme.text }]}>{t("vault.confirm.title", { name: confirm ? modelName(t, confirm.entry.model) : "" })}</Text>
          <Text testID="confirm-text" style={[type.body, { color: theme.text2 }]}>
            {confirm?.entry.plan?.via === "play"
              ? t("vault.confirm.play", { size: formatModelBytes(confirm.entry.model.bytes) })
              : t("vault.confirm.https", { size: formatModelBytes(confirm?.entry.model.bytes ?? 0), host: confirm?.entry.plan?.host ?? "" })}
          </Text>
          {confirm?.entry.plan?.via === "https" ? (
            <View style={styles.switchRow}>
              <Text style={[type.body, { color: theme.text }]}>{t("vault.confirm.wifiOnly")}</Text>
              <Toggle testID="wifi-only" value={prefs.wifiOnly} onChange={(v) => updatePrefs({ wifiOnly: v })} />
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

      <HfSearch visible={hfOpen} device={device} theme={theme} onClose={() => setHfOpen(false)} onPick={pickFromHf} />

      <Sheet visible={picker === "use"} onClose={() => setPicker(null)} title={t("vault.bestFor.use")} testID="best-for-use-sheet">
        {USE_CASES.map((u) => (
          <SheetItem
            key={u}
            testID={`best-for-use-${u}`}
            label={t(`use.${u}`)}
            onPress={() => {
              setBestUse(u);
              setPicker(null);
            }}
          />
        ))}
      </Sheet>
      <Sheet visible={picker === "language"} onClose={() => setPicker(null)} title={t("vault.bestFor.language")} testID="best-for-language-sheet">
        {FIT_LANGUAGES.map((code) => (
          <SheetItem
            key={code}
            testID={`best-for-language-${code}`}
            label={languageName(code)}
            onPress={() => {
              setBestLanguage(code);
              setPicker(null);
            }}
          />
        ))}
      </Sheet>

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
        benchmark={benchmark}
        expected={details ? expectedSpeed(device.chip, details.tier) : undefined}
        benchmarking={benchmarking}
        onBenchmark={Platform.OS === "web" || !details ? undefined : () => void runBenchmark(details)}
      />
    </View>
  );
}

const fill = { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 } as const;

const styles = StyleSheet.create({
  root: { flex: 1 },
  stack: { flex: 1, width: "100%", alignSelf: "center" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, height: 44 },
  headerBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  centered: { textAlign: "center", paddingHorizontal: 16, paddingTop: 4 },
  sectionHeader: { paddingTop: 14, paddingBottom: 8 },
  bestFor: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingTop: 10 },
  pick: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: 32, paddingHorizontal: 10, borderWidth: 1, borderRadius: radius.chip },
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
