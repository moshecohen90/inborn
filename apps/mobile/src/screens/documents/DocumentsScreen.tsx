import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { FlatList, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../../services/theme";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BannerSpacer } from "../../components/shell/bannerInset";
import { radius } from "@inborn/ui";
import { PRODUCTS, fallbackPrice, fileIntake, formatBytes, paywallFor, type DocumentRecord, type PaywallReason } from "@inborn/core";
import { useEntitlement, useLicence } from "../../licence";
import { writeDevResult } from "../../adapters/devModel";
import { ocrEngine } from "../../../modules/doc-extract";
import { DEV_AUTOASK, DEV_AUTOASK_STRICT, DEV_AUTOINDEX, DEV_AUTOOCR } from "../../documents/devFlags";
import { devOcrReads } from "../../documents/extract";
import { installEmbedder } from "../../documents/embedder";
import { devFileUri, sizeOf } from "../../documents/files";
import { listClipping } from "../../lib/listClipping";
import { useContentMaxWidth } from "../../lib/useLayout";
import { useDocuments } from "../../documents/hooks";
import { FREE_PAGE_CAP } from "../../documents/library";
import { PICK_TYPES, pickedName, sniffPicked } from "../../documents/office";
import { chooseFile } from "../../documents/chooseFile";
import { planDrop } from "../../documents/dropped";
import { openDropped } from "../../documents/drop";
import { droppedPaths, subscribeDroppedPaths, takeDroppedPaths } from "../../documents/dropQueue";
import { useVault } from "../../vault";
import { AskDocuments, type AskOutcome } from "./AskDocuments";
import { DocumentDetails } from "./DocumentDetails";
import { DocumentRow } from "./DocumentRow";
import { font } from "../../services/type";
import { Actions, Toggle } from "../../components/shell/primitives";
import { ProTag } from "../../components/chat/Sheet";
import { installFailureText } from "../../vault/failureText";

export interface DocumentsScreenProps {
  onClose: () => void;
  /** Overrides the licence (tests, headless runs); Free attaches one file of up to 20 pages (spec §7.3). */
  pro?: boolean;
  /** The 2nd document is a §12.3 value moment: "Add file" opens the paywall instead. */
  onUnlock?: (reason: PaywallReason) => void;
}

/** S40 Document library: documents with state, strict mode, add file, ask about selected, details. */
export function DocumentsScreen({ onClose, pro: proOverride, onUnlock }: DocumentsScreenProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const contentMax = useContentMaxWidth();
  const { library, state } = useDocuments();
  const { vault } = useVault();
  const { tier, can } = useEntitlement();
  const licence = useLicence();
  const pro = proOverride ?? can("documents");
  const [workMoment, setWorkMoment] = useState(false);
  const workPrice = (licence?.priceOf(PRODUCTS.work) ?? fallbackPrice(PRODUCTS.work)).display;
  const addLocked = paywallFor(tier, { kind: "document", existing: state.documents.length }) && proOverride === undefined;
  /* §7.3: "answer only from my documents" and on-device OCR are both Pro rows; the headless override stands in for a licence. */
  const strictLocked = proOverride === undefined && !can("strictDocuments");
  const ocrLocked = proOverride === undefined && !can("ocr");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [details, setDetails] = useState<DocumentRecord | null>(null);
  const [ask, setAsk] = useState<{ docs: DocumentRecord[]; auto?: string } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const devDone = useRef(false);
  const devResults = useRef<Record<string, unknown>>({});

  useEffect(() => {
    void library.ready();
  }, [library]);

  useEffect(() => vault.recheckSpace(), [vault]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  const importUri = useCallback(
    async (uri: string, name: string) => {
      const doc = await library.importFile(uri, name, { pageCap: pro ? undefined : FREE_PAGE_CAP });
      if (doc.status === "failed" || doc.status === "empty") setToast(t(`documents.error.${doc.error ?? doc.status}`, { defaultValue: doc.error ?? doc.status }));
      return doc;
    },
    [library, pro, t],
  );

  /* Headless proof: import fixtures pushed into the document directory, then ask over them. The flags are bundle-time and never set for a store build, so a Release simulator build can run it too. */
  useEffect(() => {
    if (devDone.current || (!DEV_AUTOINDEX.length && !DEV_AUTOASK && !DEV_AUTOOCR)) return;
    devDone.current = true;
    void (async () => {
      await library.ready();
      const started = Date.now();
      for (const name of DEV_AUTOINDEX) await importUri(devFileUri(name), name);
      const wait = () =>
        new Promise<void>((resolve) => {
          const check = () => {
            const s = library.state();
            if (s.documents.every((d) => d.status !== "queued" && d.status !== "indexing")) resolve();
            else setTimeout(check, 500);
          };
          check();
        });
      await wait();
      if (DEV_AUTOOCR) {
        for (const d of library.state().documents) if (d.status === "needs-ocr") library.runOcr(d.id);
        await wait();
      }
      const docs = library.state().documents.map((d) => ({ name: d.name, kind: d.kind, status: d.status, pages: d.pages, indexedPages: d.indexedPages, chunks: d.chunkCount, language: d.language, flagged: d.flaggedLines, ocrPages: d.ocrPages, error: d.error, uri: d.uri, bytesOnDisk: d.uri ? sizeOf(d.uri) : 0 }));
      devResults.current = { indexMs: Date.now() - started, embedder: library.state().embedder, store: library.state().storeKind, docs, ocrEngine: ocrEngine(), ocr: devOcrReads };
      writeDevResult(devResults.current);
      if (DEV_AUTOASK) {
        if (DEV_AUTOASK_STRICT) library.setStrict(true);
        setAsk({ docs: library.state().documents.filter((d) => d.chunkCount > 0), auto: DEV_AUTOASK });
      }
    })();
  }, [library, importUri]);

  const onDevResult = (r: AskOutcome) => {
    if (!DEV_AUTOINDEX.length && !DEV_AUTOASK) return;
    writeDevResult({ ...devResults.current, ask: r });
  };

  const pickAndImport = async () => {
    if (addLocked) {
      onUnlock?.("document");
      return;
    }
    try {
      const picked = await chooseFile(PICK_TYPES);
      if (!picked) return;
      const name = pickedName(picked.uri, picked.name);
      const kind = sniffPicked(picked.uri, name);
      if (kind === "image") return setToast(t("documents.drop.photo", { names: name }));
      /* Excel / HTML are Work (§7.3 row 8): the file is not copied in; the card below is the value moment (§12.3). */
      const verdict = fileIntake(tier, kind, state.documents.length);
      if (proOverride === undefined && verdict.kind === "paywall") {
        if (verdict.moment === "office") setWorkMoment(true);
        else onUnlock?.("document");
        return;
      }
      await importUri(picked.uri, name);
    } catch (e: unknown) {
      console.warn("[documents] pick", e);
    }
  };

  /* §8.9, gap 30: files dropped on the desktop window land here, whichever screen was up when they were dropped. */
  const waiting = useSyncExternalStore(subscribeDroppedPaths, droppedPaths, () => droppedPaths());
  const importing = useRef(false);
  useEffect(() => {
    if (!waiting.length || importing.current) return;
    importing.current = true;
    void (async () => {
      try {
        const paths = takeDroppedPaths();
        const opened = (await Promise.all(paths.map(openDropped))).filter((o): o is NonNullable<typeof o> => o !== null);
        const plan = planDrop(opened, proOverride === undefined ? tier : "pro", state.documents.length);
        const byPath = new Map(opened.map((o) => [o.path, o.uri]));
        for (const file of plan.accept) {
          const uri = byPath.get(file.path);
          if (uri) await importUri(uri, file.name);
        }
        /* Say what was left out rather than letting a file vanish into the window (the drop is a gesture, not a dialog). */
        if (plan.rejected.some((r) => r.reason === "work-only")) setWorkMoment(true);
        else if (plan.rejected.some((r) => r.reason === "over-free-limit")) onUnlock?.("document");
        const photos = plan.rejected.filter((r) => r.reason === "photo");
        const others = plan.rejected.filter((r) => r.reason !== "photo");
        if (others.length) setToast(t("documents.drop.skipped", { names: others.map((r) => r.name).join(", ") }));
        else if (photos.length) setToast(t("documents.drop.photo", { names: photos.map((r) => r.name).join(", ") }));
      } finally {
        importing.current = false;
      }
    })();
  }, [waiting, importUri, onUnlock, proOverride, state.documents.length, t, tier]);

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const askSelected = () => {
    const docs = state.documents.filter((d) => selected.has(d.id) && d.chunkCount > 0);
    if (docs.length) setAsk({ docs });
  };

  const embedState = vault.state("embed-nomic");
  const embedModel = vault.model("embed-nomic");
  const embedderMissing = state.embedder.kind === "missing";
  const totalBytes = state.documents.reduce((n, d) => n + d.bytes, 0);
  const ocrAvailable = Platform.OS !== "web";

  return (
    <View testID="documents-screen" style={[styles.root, { backgroundColor: theme.bg, paddingTop: insets.top }]}>
      <View style={[styles.stack, { maxWidth: contentMax }]}>
      <View style={styles.header}>
        {/* "Schließen" and "Datei hinzufügen" are never the same width, so a title between them drifts (QA F245); it is centred on the bar instead. */}
        <View pointerEvents="none" style={styles.titleWrap}>
          <Text numberOfLines={1} style={[styles.title, { color: theme.text }]}>{t("documents.title")}</Text>
        </View>
        <Pressable testID="documents-close" accessibilityRole="button" onPress={onClose} style={styles.headerBtn}>
          <Text style={[styles.headerBtnText, { color: theme.text2 }]}>{t("documents.close")}</Text>
        </Pressable>
        <Pressable testID="documents-add" accessibilityRole="button" onPress={pickAndImport} style={styles.headerBtn}>
          <Text style={[styles.headerBtnText, styles.right, { color: addLocked ? theme.accent : theme.text }]}>{addLocked ? t("documents.addPro") : t("documents.add")}</Text>
        </Pressable>
      </View>
      <BannerSpacer />
      {state.documents.length ? <Text style={[styles.mono, styles.centered, { color: theme.text3 }]}>{t("documents.storage", { count: state.documents.length, size: formatBytes(totalBytes) })}</Text> : null}
      <View style={[styles.strictRow, { backgroundColor: theme.surface1, borderColor: theme.border }]}>
        <View style={styles.strictText}>
          <Text style={[styles.strictTitle, { color: theme.text }]}>{t("documents.strict.title")}</Text>
          <Text style={[styles.strictHint, { color: theme.text3 }]}>{t("documents.strict.hint")}</Text>
        </View>
        {strictLocked ? <ProTag onPress={() => onUnlock?.("strictDocuments")} /> : null}
        <Toggle testID="documents-strict" label={t("documents.strict.title")} value={state.strict && !strictLocked} onChange={(v) => (strictLocked ? onUnlock?.("strictDocuments") : library.setStrict(v))} />
      </View>
      {/* The headline of an empty screen reads before the cards that offer to fill it (QA F249). */}
      {state.documents.length ? null : (
        <View testID="documents-empty" style={styles.empty}>
          <Text style={[styles.emptyTitle, { color: theme.text }]}>{t("documents.empty.title")}</Text>
          <Text style={[styles.body, styles.centered, { color: theme.text2 }]}>{t("documents.empty.hint")}</Text>
        </View>
      )}
      {workMoment ? (
        <View testID="office-work-card" style={[styles.card, { backgroundColor: theme.surface1, borderColor: theme.accent }]}>
          <Text style={[styles.label, { color: theme.accent }]}>{t("documents.office.eyebrow")}</Text>
          <Text style={[styles.strictTitle, { color: theme.text }]}>{t("documents.office.title")}</Text>
          <Text style={[styles.body, { color: theme.text }]}>{t("documents.office.explain")}</Text>
          <Text style={[styles.mono, { color: theme.text2 }]}>{t("paywall.priceLine", { price: workPrice })}</Text>
          <View style={styles.cardRow}>
            <Pressable testID="office-work-unlock" accessibilityRole="button" onPress={() => onUnlock?.("office")} style={[styles.btn, styles.grow, { backgroundColor: theme.ctaFill }]}>
              <Text style={[styles.btnText, { color: theme.ctaText }]}>{t("gate.unlockWork")}</Text>
            </Pressable>
            <Pressable testID="office-work-dismiss" accessibilityRole="button" onPress={() => setWorkMoment(false)} style={[styles.btn, styles.ghost, { borderColor: theme.border }]}>
              <Text style={[styles.btnText, { color: theme.text2 }]}>{t("documents.office.notNow")}</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
      {embedderMissing ? (
        <View testID="embedder-card" style={[styles.card, { backgroundColor: theme.surface1, borderColor: theme.border }]}>
          <Text style={[styles.label, { color: theme.accent }]}>{t("documents.embedder.title")}</Text>
          <Text style={[styles.body, { color: theme.text }]}>{t("documents.embedder.explain", { size: formatBytes(embedModel?.bytes ?? 274290560) })}</Text>
          {embedState.kind === "delivering" ? (
            <Text style={[styles.mono, { color: theme.text2 }]}>{t("vault.state.delivering", { percent: Math.floor((100 * embedState.bytes) / Math.max(1, embedState.total)), done: formatBytes(embedState.bytes), total: formatBytes(embedState.total) })}</Text>
          ) : embedState.kind === "verifying" ? (
            <Text style={[styles.mono, { color: theme.text2 }]}>{t("vault.state.verifying")}</Text>
          ) : (
            <>
            {embedState.kind === "needs-space" ? (
              <Text testID="embedder-needs-space" style={[styles.mono, { color: theme.danger }]}>{t("vault.state.needsSpace", { size: formatBytes(embedState.requiredBytes - embedState.freeBytes) })}</Text>
            ) : embedState.kind === "failed" ? (
              <Text testID="embedder-failed" style={[styles.mono, { color: theme.danger }]}>{installFailureText(t, embedState.error, Platform.OS)}</Text>
            ) : null}
            <Pressable
              testID="embedder-install"
              accessibilityRole="button"
              onPress={() => void installEmbedder().then(() => library.refreshEmbedder())}
              style={[styles.btn, { backgroundColor: theme.ctaFill }]}
            >
              <Text style={[styles.btnText, { color: theme.ctaText }]}>{t("documents.embedder.install", { size: formatBytes(embedModel?.bytes ?? 274290560) })}</Text>
            </Pressable>
            </>
          )}
        </View>
      ) : null}
      <FlatList
        {...listClipping}
        data={state.documents}
        keyExtractor={(d) => d.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <DocumentRow
            doc={item}
            progress={state.progress.get(item.id)}
            theme={theme}
            selected={selected.has(item.id)}
            onPress={() => setDetails(item)}
            onToggleSelect={() => toggle(item.id)}
            onCancel={() => library.cancel(item.id)}
            onResume={() => library.resume(item.id)}
            onOcr={() => (ocrLocked ? onUnlock?.("ocr") : library.runOcr(item.id))}
            ocrAvailable={ocrAvailable}
            ocrLocked={ocrLocked}
          />
        )}
      />
      <View style={[styles.footer, { borderColor: theme.border, paddingBottom: insets.bottom + 12 }]}>
        <Actions>
        <Pressable
          testID="documents-ask-selected"
          accessibilityRole="button"
          disabled={!selected.size}
          onPress={askSelected}
          style={[styles.btn, { backgroundColor: selected.size ? theme.ctaFill : theme.surface2 }]}
        >
          <Text style={[styles.btnText, { color: selected.size ? theme.ctaText : theme.text3 }]}>{t("documents.askSelected", { count: selected.size })}</Text>
        </Pressable>
        </Actions>
        <Text style={[styles.mono, styles.centered, { color: theme.text3 }]}>{t("documents.onDevice", { store: state.storeKind })}</Text>
      </View>
      </View>
      {toast ? (
        <View style={[styles.toast, { backgroundColor: theme.surface2, borderColor: theme.border }]}>
          <Text style={[styles.body, { color: theme.text }]}>{toast}</Text>
        </View>
      ) : null}
      {details ? (
        <DocumentDetails
          doc={library.document(details.id) ?? details}
          theme={theme}
          ocrEngine={ocrEngine()}
          onClose={() => setDetails(null)}
          onAsk={() => {
            const d = library.document(details.id);
            setDetails(null);
            if (d) setAsk({ docs: [d] });
          }}
          onDelete={() => {
            const id = details.id;
            setDetails(null);
            setSelected((s) => {
              const next = new Set(s);
              next.delete(id);
              return next;
            });
            void library.remove(id).then(() => setToast(t("documents.deleted")));
          }}
        />
      ) : null}
      {ask ? <AskDocuments docs={ask.docs} theme={theme} autoQuestion={ask.auto} onResult={onDevResult} onClose={() => setAsk(null)} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  stack: { flex: 1, width: "100%", alignSelf: "center" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, height: 44 },
  headerBtn: { minWidth: 64, height: 44, justifyContent: "center" },
  headerBtnText: { ...font("sans"), fontSize: 16 },
  right: { textAlign: "right" },
  title: { ...font("sans", "600"), fontSize: 17, textAlign: "center" },
  titleWrap: { position: "absolute", left: 72, right: 72, top: 0, bottom: 0, alignItems: "center", justifyContent: "center" },
  mono: { ...font("mono"), fontSize: 11, letterSpacing: 0.5 },
  label: { ...font("mono", "500"), fontSize: 11, letterSpacing: 0.9, textTransform: "uppercase" },
  centered: { textAlign: "center", paddingTop: 4 },
  strictRow: { flexDirection: "row", alignItems: "center", gap: 12, margin: 12, padding: 12, borderRadius: radius.card, borderWidth: 1 },
  strictText: { flex: 1, gap: 2 },
  strictTitle: { ...font("sans", "600"), fontSize: 15 },
  strictHint: { ...font("sans"), fontSize: 12 },
  card: { marginHorizontal: 12, marginBottom: 8, padding: 14, borderRadius: radius.card, borderWidth: 1, gap: 8 },
  body: { ...font("sans"), fontSize: 14, lineHeight: 20 },
  list: { paddingHorizontal: 12, paddingBottom: 12, gap: 8, flexGrow: 1 },
  empty: { paddingVertical: 32, paddingHorizontal: 24, alignItems: "center", gap: 8 },
  emptyTitle: { ...font("sans", "600"), fontSize: 20 },
  footer: { padding: 12, borderTopWidth: 1, gap: 6 },
  btn: { height: 44, borderRadius: radius.control, alignItems: "center", justifyContent: "center" },
  cardRow: { flexDirection: "row", gap: 8 },
  grow: { flex: 1 },
  ghost: { borderWidth: 1, paddingHorizontal: 16 },
  btnText: { ...font("sans", "600"), fontSize: 16 },
  toast: { position: "absolute", left: 16, right: 16, bottom: 96, padding: 12, borderRadius: radius.card, borderWidth: 1 },
});
