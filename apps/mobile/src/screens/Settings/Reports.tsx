import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { formatBytes, reportBytes, reportText, type Report } from "@inborn/core";
import { useTheme } from "../../services/theme";
import { useAppServices } from "../../services/AppServices";
import { Screen } from "../../components/shell/Screen";
import { Button, Row } from "../../components/shell/primitives";
import { Sheet } from "../../components/shell/Sheet";
import { shareFile } from "../../lib/share";
import { afterSheetClose } from "../Chat";
import { useType } from "../../services/type";

/** Settings › Reports (§8.2 S13): every report saved on this device; email it through the share sheet or delete it. Nothing is ever sent by Inborn. */
export function Reports() {
  const type = useType();
  const { t, i18n } = useTranslation();
  const { theme } = useTheme();
  const { store } = useAppServices();
  const [reports, setReports] = useState<Report[] | null>(null);
  const [open, setOpen] = useState<Report | null>(null);

  const reload = useCallback(() => {
    store.library
      .listReports()
      .then(setReports)
      .catch(() => setReports([]));
  }, [store]);
  useEffect(reload, [reload]);

  const when = (ms: number) => new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium", timeStyle: "short" }).format(new Date(ms));
  const remove = async (r: Report) => {
    await store.library.deleteReport(r.id);
    setOpen(null);
    reload();
  };
  const email = (r: Report) => {
    setOpen(null);
    afterSheetClose(() => void shareFile({ filename: "inborn-report.txt", mimeType: "text/plain", body: reportText(r) }, t("report.email")));
  };

  return (
    <Screen header={{ back: true, title: t("reports.title") }} testID="reports">
      <Text style={[type.bodySmall, { color: theme.text2 }]}>{t("reports.explain")}</Text>
      {reports && reports.length === 0 ? <Text testID="reports-empty" style={[type.bodySmall, styles.spaced, { color: theme.text3 }]}>{t("reports.empty")}</Text> : null}
      {(reports ?? []).map((r) => (
        <Row key={r.id} testID={`report-${r.id}`} label={t(`report.reason.${r.reason}`)} sub={when(r.createdAt)} value={formatBytes(reportBytes(r))} onPress={() => setOpen(r)} chevron />
      ))}
      <Sheet visible={open !== null} onClose={() => setOpen(null)} title={open ? t(`report.reason.${open.reason}`) : ""} testID="report-detail">
        {open ? (
          <View style={styles.detail}>
            <Text style={[type.mono, { color: theme.text3 }]}>{`${when(open.createdAt)}${open.modelId ? ` · ${open.modelId.toUpperCase()}` : ""}`}</Text>
            {open.note ? <Text style={[type.body, { color: theme.text }]}>{open.note}</Text> : null}
            {open.messageText ? (
              <Text style={[type.bodySmall, styles.message, { color: theme.text2, borderColor: theme.border }]} numberOfLines={12}>
                {open.messageText}
              </Text>
            ) : null}
            <Text style={[type.caption, { color: theme.text3 }]}>{t("reports.emailNote")}</Text>
            <Button testID="report-detail-email" title={t("report.email")} onPress={() => email(open)} />
            <Button testID="report-detail-delete" title={t("reports.delete")} variant="danger" onPress={() => void remove(open)} />
          </View>
        ) : null}
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  spaced: { paddingTop: 8 },
  detail: { gap: 12 },
  message: { borderWidth: 1, borderRadius: 8, padding: 10 },
});
