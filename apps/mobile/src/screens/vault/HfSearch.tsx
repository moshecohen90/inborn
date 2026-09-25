import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { AppModal } from "../../components/shell/AppModal";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon, radius, type Theme } from "@inborn/ui";
import { HF_HOST, formatModelBytes, hfFileAsModel, ramNeedGB, type CatalogModel, type HfFile, type HfRepo, type HfRepoInfo } from "@inborn/core";
import { GlassFill, panelColor, panelStyle } from "../../components/shell/NativeChrome";
import { Toggle } from "../../components/shell/primitives";
import { font, useType } from "../../services/type";
import { deviceNoun } from "../../lib/deviceNoun";
import type { DeviceInfo } from "../../vault";
import { HfRequestError, hfRepoInfo, hfSearch, readHfToken, writeHfToken, type HfError } from "../../vault/hf";
import { useOpenSheet } from "../../lib/openSheets";
import { LicenceSheet, type LicenceSubject } from "../../components/LicenceSheet";

export interface HfSearchProps {
  visible: boolean;
  device: DeviceInfo;
  theme: Theme;
  onClose: () => void;
  /** The picked file, in catalog shape; the vault adds it and opens the download confirmation (S30). */
  onPick: (model: CatalogModel) => void;
}

type Phase = { kind: "idle" } | { kind: "searching" } | { kind: "results"; repos: HfRepo[] } | { kind: "error"; error: HfError };
type Files = { kind: "loading" } | { kind: "ready"; info: HfRepoInfo } | { kind: "error"; error: HfError };

const errorOf = (e: unknown): HfError => (e instanceof HfRequestError ? e.kind : "offline");
const compact = (n: number): string => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));

/** S30 "Search HF" (spec §7.2, iOS + desktop): search → repo → GGUF files with size, quant and fit → download through the vault. */
export function HfSearch({ visible, device, theme, onClose, onPick }: HfSearchProps) {
  const type = useType();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [open, setOpen] = useState<string | null>(null);
  const [files, setFiles] = useState<Record<string, Files>>({});
  const [token, setToken] = useState("");
  const [hasToken, setHasToken] = useState(false);
  const [tokenOpen, setTokenOpen] = useState(false);
  /* F54 · §11.4: someone else's weights are not downloaded until their licence has been shown and accepted. */
  const [pending, setPending] = useState<{ model: CatalogModel; subject: LicenceSubject } | null>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!visible) return;
    void readHfToken().then((v) => setHasToken(!!v));
    return () => abort.current?.abort();
  }, [visible]);

  const search = async () => {
    const q = query.trim();
    if (!q) return;
    abort.current?.abort();
    const ac = new AbortController();
    abort.current = ac;
    setPhase({ kind: "searching" });
    setOpen(null);
    try {
      const repos = await hfSearch(q, ac.signal);
      if (!ac.signal.aborted) setPhase({ kind: "results", repos });
    } catch (e: unknown) {
      if (!ac.signal.aborted) setPhase({ kind: "error", error: errorOf(e) });
    }
  };

  const toggleRepo = (repo: HfRepo) => {
    if (open === repo.id) return setOpen(null);
    setOpen(repo.id);
    if (files[repo.id]?.kind === "ready") return;
    setFiles((f) => ({ ...f, [repo.id]: { kind: "loading" } }));
    hfRepoInfo(repo.id).then(
      (info) => setFiles((f) => ({ ...f, [repo.id]: { kind: "ready", info } })),
      (e: unknown) => setFiles((f) => ({ ...f, [repo.id]: { kind: "error", error: errorOf(e) } })),
    );
  };

  const saveToken = async () => {
    await writeHfToken(token || null);
    setHasToken(!!token.trim());
    setToken("");
    setTokenOpen(false);
  };

  const fitLine = (file: HfFile): { text: string; ok: boolean } => {
    const need = ramNeedGB(file.bytes);
    if (device.ramGB < need.min) return { text: t("vault.willNotRun", { ram: device.ramGB }), ok: false };
    if (device.ramGB < need.recommended) return { text: t("vault.runsSlowly", { ram: device.ramGB }), ok: true };
    return { text: t("vault.hf.fits", { device: deviceNoun() }), ok: true };
  };

  useOpenSheet(visible, onClose);
  return (
    <AppModal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel={t("vault.close")} />
      <View testID="hf-search" style={[styles.sheet, panelStyle, { backgroundColor: panelColor(theme.surface1), borderColor: theme.border, top: insets.top + 24, paddingBottom: insets.bottom + 16 }]}>
        <GlassFill />
        <View style={styles.head}>
          <Text style={[type.title, { color: theme.text }]}>{t("vault.hf.title")}</Text>
          <Pressable testID="hf-close" accessibilityRole="button" accessibilityLabel={t("vault.close")} onPress={onClose} hitSlop={8} style={styles.iconBtn}>
            <Icon name="x" size={20} color={theme.text2} />
          </Pressable>
        </View>
        <Text style={[type.bodySmall, { color: theme.text2 }]}>{t("vault.hf.explain", { host: HF_HOST })}</Text>
        <View style={[styles.field, { backgroundColor: theme.well, borderColor: theme.border }]}>
          <TextInput
            testID="hf-query"
            value={query}
            onChangeText={setQuery}
            placeholder={t("vault.hf.placeholder")}
            placeholderTextColor={theme.text3}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            onSubmitEditing={() => void search()}
            style={[type.body, styles.input, { color: theme.text }]}
          />
          <Pressable testID="hf-go" accessibilityRole="button" onPress={() => void search()} disabled={!query.trim()} style={[styles.go, { backgroundColor: theme.ctaFill, opacity: query.trim() ? 1 : 0.45 }]}>
            <Text style={[type.bodySmall, type.strong, { color: theme.ctaText }]}>{t("vault.hf.search")}</Text>
          </Pressable>
        </View>
        <View style={styles.tokenRow}>
          <Text style={[type.caption, styles.grow, { color: theme.text3 }]}>{hasToken ? t("vault.hf.tokenSet") : t("vault.hf.tokenHint")}</Text>
          <Toggle testID="hf-token-toggle" value={tokenOpen} onChange={setTokenOpen} label={t("vault.hf.token")} />
        </View>
        {tokenOpen ? (
          <View style={styles.tokenEdit}>
            <TextInput testID="hf-token" value={token} onChangeText={setToken} placeholder="hf_…" placeholderTextColor={theme.text3} autoCapitalize="none" autoCorrect={false} secureTextEntry style={[type.body, styles.tokenInput, { color: theme.text, backgroundColor: theme.well, borderColor: theme.border }]} />
            <Pressable testID="hf-token-save" accessibilityRole="button" onPress={() => void saveToken()} style={[styles.go, { borderWidth: 1, borderColor: theme.border }]}>
              <Text style={[type.bodySmall, type.strong, { color: theme.text }]}>{token.trim() ? t("vault.hf.tokenSave") : t("vault.hf.tokenClear")}</Text>
            </Pressable>
          </View>
        ) : null}
        <ScrollView style={styles.list} contentContainerStyle={styles.listContent} keyboardShouldPersistTaps="handled">
          {phase.kind === "searching" ? <ActivityIndicator color={theme.accent} /> : null}
          {phase.kind === "error" ? (
            <Text testID="hf-error" style={[type.bodySmall, { color: theme.danger }]}>
              {t(`vault.hf.error.${phase.error}`)}
            </Text>
          ) : null}
          {phase.kind === "results" && phase.repos.length === 0 ? <Text style={[type.bodySmall, { color: theme.text2 }]}>{t("vault.hf.none")}</Text> : null}
          {phase.kind === "results"
            ? phase.repos.map((repo) => {
                const f = files[repo.id];
                const expanded = open === repo.id;
                return (
                  <View key={repo.id} testID={`hf-repo-${repo.id}`} style={[styles.repo, { borderColor: expanded ? theme.accent : theme.border, backgroundColor: theme.surface2 }]}>
                    <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => toggleRepo(repo)} style={styles.repoHead}>
                      <View style={styles.grow}>
                        <Text numberOfLines={2} style={[type.body, { color: theme.text }]}>
                          {repo.id}
                        </Text>
                        <Text style={[type.mono, { color: theme.text3 }]}>
                          {t("vault.hf.stats", { downloads: compact(repo.downloads), likes: compact(repo.likes) })}
                          {repo.gated ? ` · ${t("vault.hf.gated")}` : ""}
                        </Text>
                      </View>
                      <Icon name={expanded ? "chevronDown" : "chevronRight"} size={16} color={theme.text3} />
                    </Pressable>
                    {expanded ? (
                      <View style={styles.files}>
                        {!f || f.kind === "loading" ? <ActivityIndicator color={theme.accent} /> : null}
                        {f?.kind === "error" ? <Text style={[type.bodySmall, { color: theme.danger }]}>{t(`vault.hf.error.${f.error}`)}</Text> : null}
                        {f?.kind === "ready" && f.info.files.length === 0 ? <Text style={[type.bodySmall, { color: theme.text2 }]}>{t("vault.hf.noFiles")}</Text> : null}
                        {f?.kind === "ready"
                          ? f.info.files.map((file) => {
                              const fit = fitLine(file);
                              return (
                                <View key={file.path} testID={`hf-file-${file.path}`} style={[styles.file, { borderTopColor: theme.border }]}>
                                  <View style={styles.grow}>
                                    <Text numberOfLines={2} style={[type.bodySmall, { color: theme.text }]}>
                                      {file.path}
                                    </Text>
                                    <Text style={[type.mono, { color: theme.text3 }]}>
                                      {[formatModelBytes(file.bytes), file.quant, fit.text].filter(Boolean).join(" · ")}
                                    </Text>
                                  </View>
                                  <Pressable
                                    testID={`hf-pick-${file.path}`}
                                    accessibilityRole="button"
                                    onPress={() => {
                                      const model = hfFileAsModel(f.info, file);
                                      setPending({ model, subject: { name: f.info.id, license: model.license, licenseUrl: `https://${HF_HOST}/${f.info.id}` } });
                                    }}
                                    style={[styles.pick, fit.ok ? { backgroundColor: theme.ctaFill } : { borderWidth: 1, borderColor: theme.border }]}
                                  >
                                    <Text style={[type.caption, type.strong, { color: fit.ok ? theme.ctaText : theme.text }]}>{t("vault.hf.download")}</Text>
                                  </Pressable>
                                </View>
                              );
                            })
                          : null}
                        {f?.kind === "ready" ? (
                          <Text style={[type.caption, { color: theme.text3 }]}>
                            {t("vault.hf.licence", { license: f.info.license ?? t("vault.hf.licenceUnknown") })}
                          </Text>
                        ) : null}
                      </View>
                    ) : null}
                  </View>
                );
              })
            : null}
        </ScrollView>
        <LicenceSheet
          visible={pending !== null}
          subject={pending?.subject ?? null}
          onClose={() => setPending(null)}
          onAccept={() => {
            const model = pending?.model;
            setPending(null);
            if (model) onPick(model);
          }}
        />
      </View>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  backdrop: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.45)" },
  sheet: { position: "absolute", left: 0, right: 0, bottom: 0, padding: 20, gap: 10, borderTopWidth: 1, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center", marginRight: -12 },
  field: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: radius.control, paddingLeft: 12, paddingRight: 4, minHeight: 44 },
  input: { flex: 1, minHeight: 44, paddingVertical: 8 },
  go: { minHeight: 36, paddingHorizontal: 14, borderRadius: radius.control, alignItems: "center", justifyContent: "center" },
  tokenRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  tokenEdit: { flexDirection: "row", alignItems: "center", gap: 8 },
  tokenInput: { flex: 1, minHeight: 44, borderWidth: 1, borderRadius: radius.control, paddingHorizontal: 12, ...font("mono") },
  grow: { flex: 1, gap: 2 },
  list: { flexGrow: 1, flexShrink: 1 },
  listContent: { gap: 8, paddingBottom: 8 },
  repo: { borderWidth: 1, borderRadius: radius.card, padding: 12, gap: 8 },
  repoHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  files: { gap: 8 },
  file: { flexDirection: "row", alignItems: "center", gap: 10, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth },
  pick: { minHeight: 32, paddingHorizontal: 12, borderRadius: radius.control, alignItems: "center", justifyContent: "center" },
});
