import { Platform, StyleSheet, Text, View, type ViewStyle } from "react-native";
import { useTranslation } from "react-i18next";
import { Icon, radius, type Theme } from "@inborn/ui";
import { COMPARE_APP_ONLY, COMPARE_ROWS, COMPARE_TIERS, compareCell, type CompareCell, type LicenceTier } from "@inborn/core";
import { useType } from "../../services/type";

export interface CompareTableProps {
  theme: Theme;
  /** The column to mark as the one this person is on; undefined on the web page, where nobody owns anything yet. */
  owned?: LicenceTier;
}

/* 18 rows outrun every viewport, and RN has no `position: sticky` in its style types; on the web the header row keeps
   FREE / PRO / WORK on screen while the page scrolls, which is the only reason the ticks mean anything (QA F225). */
const STICKY_HEAD: ViewStyle | null = Platform.OS === "web" ? ({ position: "sticky", top: 0, zIndex: 1 } as unknown as ViewStyle) : null;

/** The web build has no OCR (documents/extract.ts), so its ✓ carries a footnote instead of a promise. */
const appOnlyHere = (id: string): boolean => Platform.OS === "web" && COMPARE_APP_ONLY.includes(id);

function cellText(cell: CompareCell, t: (k: string) => string): string {
  if (cell.kind === "unlimited") return t("paywall.compare.unlimited");
  if (cell.kind === "count") return String(cell.n);
  return cell.kind === "yes" ? t("paywall.compare.yes") : t("paywall.compare.no");
}

/** The Free / Pro / Work table (spec §7.3). Every cell comes from `compareCell`, so it cannot promise what the gates refuse. */
export function CompareTable({ theme, owned }: CompareTableProps) {
  const { t } = useTranslation();
  const type = useType();
  return (
    <View testID="compare-table" style={[styles.table, { borderColor: theme.border, backgroundColor: theme.surface1 }]}>
      <Text style={[type.monoLabel, styles.caption, { color: theme.text3 }]}>{t("paywall.compare.title")}</Text>
      <View testID="compare-head" style={[styles.row, styles.head, STICKY_HEAD, { borderBottomColor: theme.border, backgroundColor: theme.surface1 }]}>
        <View style={styles.label} />
        {COMPARE_TIERS.map((tier) => (
          <Text key={tier} style={[type.monoLabel, styles.cell, { color: tier === owned ? theme.accent : theme.text2 }]}>
            {t(`paywall.compare.${tier}`)}
          </Text>
        ))}
      </View>
      {COMPARE_ROWS.map((row) => (
        <View key={row.id} testID={`compare-${row.id}`} style={[styles.row, { borderBottomColor: theme.border }]}>
          <Text style={[type.bodySmall, styles.label, { color: theme.text }]}>
            {t(`paywall.compare.row.${row.id}`)}
            {appOnlyHere(row.id) ? <Text style={{ color: theme.text3 }}> †</Text> : null}
          </Text>
          {COMPARE_TIERS.map((tier) => {
            const cell = compareCell(row, tier);
            const on = cell.kind !== "no";
            return (
              <View key={tier} testID={`compare-${row.id}-${tier}`} style={styles.cell} accessibilityLabel={cellText(cell, t)}>
                {cell.kind === "yes" ? (
                  <Icon name="check" size={14} color={tier === owned ? theme.accent : theme.text2} />
                ) : (
                  /* "Unlimited" clipped in a 62 pt column in every language; the glyph reads the same in all of them and the row keeps its word for screen readers. */
                  <Text numberOfLines={1} style={[type.mono, styles.cellText, { color: on ? (tier === owned ? theme.accent : theme.text2) : theme.text3 }]}>
                    {cell.kind === "no" ? "—" : cell.kind === "unlimited" ? "∞" : String(cell.n)}
                  </Text>
                )}
              </View>
            );
          })}
        </View>
      ))}
      {COMPARE_ROWS.some((row) => appOnlyHere(row.id)) ? (
        <Text testID="compare-app-only" style={[type.mono, styles.note, { color: theme.text3 }]}>
          {t("paywall.compare.appOnly")}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  table: { borderWidth: 1, borderRadius: radius.card, paddingHorizontal: 12, paddingVertical: 10 },
  caption: { paddingBottom: 6 },
  row: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 38, borderBottomWidth: StyleSheet.hairlineWidth },
  head: { minHeight: 30 },
  label: { flex: 1, paddingVertical: 6 },
  cell: { width: 62, alignItems: "center", justifyContent: "center" },
  cellText: { textAlign: "center" },
  note: { paddingTop: 8 },
});
