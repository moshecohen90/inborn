import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Icon } from "@inborn/ui";

import { useTheme } from "../../services/theme";
import { useType } from "../../services/type";
import { PANEL_WIDTH, SIDEBAR_WIDTH, hasPanel, type LayoutMode } from "../../lib/layout";
import { closeSidePanel, useSidePanel } from "../../lib/sidePanel";
import { ChatsPane } from "./ChatsPane";
import { PassagePanel } from "../../documents/Citations";
import { DocumentsScreen } from "../../screens/documents";
import { openPaywall } from "../../licence";

/**
 * The sidebar shell of §8.9: a permanent 280 px sidebar (chats, projects, vault, proof, settings), the screen stack as the
 * centre column, and the document/citation panel on the right once the window is at the §9.7 desktop minimum.
 */
export function WideShell({ mode, sidebar, children }: { mode: LayoutMode; sidebar: boolean; children: ReactNode }) {
  const { theme } = useTheme();
  const panel = useSidePanel();
  return (
    <View style={styles.row}>
      {sidebar ? (
        <View testID="wide-sidebar" style={[styles.sidebar, { width: SIDEBAR_WIDTH, borderRightColor: theme.border, backgroundColor: theme.surface1 }]}>
          <ChatsPane embedded onClose={() => undefined} />
        </View>
      ) : null}
      <View style={styles.content}>{children}</View>
      {panel && hasPanel(mode) ? <SidePanelView panel={panel} /> : null}
    </View>
  );
}

function SidePanelView({ panel }: { panel: NonNullable<ReturnType<typeof useSidePanel>> }) {
  const { theme } = useTheme();
  const type = useType();
  const { t } = useTranslation();
  return (
    <View testID="wide-panel" style={[styles.panel, { width: PANEL_WIDTH, borderLeftColor: theme.border, backgroundColor: theme.surface1 }]}>
      {/* The library screen brings its own header (Close · Documents · Add file); a passage has none, so the panel gives it one. */}
      {panel.kind === "citation" ? (
        <>
          <View style={styles.panelHeader}>
            <Text style={[type.monoLabel, { color: theme.text3 }]}>{t("documents.sources")}</Text>
            <Pressable testID="panel-close" accessibilityRole="button" accessibilityLabel={t("documents.closePassage")} onPress={closeSidePanel} hitSlop={8} style={styles.panelClose}>
              <Icon name="x" size={18} color={theme.text2} />
            </Pressable>
          </View>
          <PassagePanel citation={panel.citation} />
        </>
      ) : (
        <DocumentsScreen onClose={closeSidePanel} onUnlock={openPaywall} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flex: 1, flexDirection: "row" },
  sidebar: { borderRightWidth: StyleSheet.hairlineWidth },
  content: { flex: 1 },
  panel: { borderLeftWidth: StyleSheet.hairlineWidth },
  panelHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingLeft: 16, paddingRight: 8, paddingTop: 12, minHeight: 40 },
  panelClose: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
});
