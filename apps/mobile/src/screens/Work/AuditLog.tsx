import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { paywallFor, renderAudit, type AuditLog as AuditLogModel, type AuditVerdict, type Folder } from "@inborn/core";
import { useTheme } from "../../services/theme";
import { useAppServices } from "../../services/AppServices";
import { Screen } from "../../components/shell/Screen";
import { Button, Mono, Row, Section } from "../../components/shell/primitives";
import { useType } from "../../services/type";
import { useEntitlement } from "../../licence";
import { shareFile } from "../../lib/share";
import { useWork, useWorkGate, WorkTag } from "../../work";

/** Settings → Pro for Work → Audit log: one vault at a time, chain verified on open, shareable as text (§7.5 Work). */
export function AuditLog() {
  const { t, i18n } = useTranslation();
  const { theme } = useTheme();
  const type = useType();
  const { store } = useAppServices();
  const { work, version } = useWork();
  const gate = useWorkGate();
  const { tier } = useEntitlement();
  const locked = paywallFor(tier, { kind: "feature", feature: "auditLog" });
  const [folders, setFolders] = useState<Folder[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const [log, setLog] = useState<AuditLogModel | null>(null);
  const [verdict, setVerdict] = useState<AuditVerdict | null>(null);

  useEffect(() => {
    void store.library.listFolders().then(setFolders);
  }, [store, version]);
  useEffect(() => {
    if (!picked) return;
    let alive = true;
    void Promise.all([work.readLog(picked), work.verifyLog(picked)]).then(([l, v]) => {
      if (!alive) return;
      setLog(l);
      setVerdict(v);
    });
    return () => {
      alive = false;
    };
  }, [picked, work, version]);

  const vaults = work.records().map((r) => ({ id: r.folderId, name: folders.find((f) => f.id === r.folderId)?.name ?? t("vaults.nameForLog") }));
  const name = vaults.find((v) => v.id === picked)?.name ?? "";
  const when = (ms: number) => new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium", timeStyle: "short" }).format(new Date(ms));

  return (
    <Screen header={{ back: true, title: t("audit.title") }} testID="audit-log">
      {locked ? (
        <View style={[styles.moment, { borderColor: theme.border, backgroundColor: theme.surface1 }]}>
          <Text style={[type.bodySmall, styles.grow, { color: theme.text2 }]}>{t("work.moment.vault", { price: gate.price })}</Text>
          <WorkTag />
        </View>
      ) : null}
      {!vaults.length ? <Text style={[type.bodySmall, { color: theme.text3 }]}>{t("audit.empty")}</Text> : null}
      {!picked ? (
        <Section title={t("audit.pick")}>
          {vaults.map((v) => (
            <Row key={v.id} testID={`audit-vault-${v.id}`} label={v.name} onPress={() => (locked ? undefined : setPicked(v.id))} chevron disabled={locked} />
          ))}
        </Section>
      ) : (
        <>
          <Section title={name}>
            {verdict ? (
              <Mono testID="audit-verdict" color={verdict.ok ? theme.sealed : theme.danger}>
                {verdict.ok ? t("audit.verified", { count: verdict.entries }) : t("audit.broken", { seq: verdict.brokenAt + 1, reason: verdict.reason })}
              </Mono>
            ) : null}
            {log?.entries
              .slice()
              .reverse()
              .map((e) => <Row key={e.seq} testID={`audit-entry-${e.seq}`} label={t(`audit.action.${e.action}`)} sub={`${when(e.at)}${e.subject?.title ? ` · ${e.subject.title}` : ""}${e.subject?.recordHash ? ` · ${e.subject.recordHash.slice(0, 12)}…` : ""}`} value={`#${e.seq}`} />)}
          </Section>
          <View style={styles.actions}>
            <Button testID="audit-share" title={t("audit.share")} onPress={() => void (log && shareFile({ filename: `inborn-audit-${picked}.txt`, mimeType: "text/plain", body: renderAudit(log, name) }, t("audit.title")))} />
            <Button title={t("templates.back")} variant="secondary" onPress={() => setPicked(null)} />
          </View>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  moment: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderWidth: 1, borderRadius: 12, marginBottom: 12 },
  grow: { flex: 1 },
  actions: { gap: 8, paddingTop: 12 },
});
