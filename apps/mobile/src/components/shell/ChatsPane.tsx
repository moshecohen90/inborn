import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { formatBytes } from "@inborn/core";

import { useAppServices } from "../../services/AppServices";
import { useTheme } from "../../services/theme";
import { Chats } from "../../screens/Chats";
import { Mono } from "./primitives";
import { ChipGlyph } from "./ChipGlyph";
import { useType } from "../../services/type";
import { meterLabel } from "../../lib/models";
import { openSidePanel } from "../../lib/sidePanel";
import { hasPanel } from "../../lib/layout";
import { useLayoutMode } from "../../lib/useLayout";

function Link({ testID, label, onPress }: { testID: string; label: string; onPress: () => void }) {
  const { theme } = useTheme();
  const type = useType();
  return (
    <Pressable testID={testID} accessibilityRole="button" onPress={onPress} style={styles.link}>
      <Text style={[type.bodySmall, type.strong, { color: theme.text }]}>{label}</Text>
    </Pressable>
  );
}

/** S20: the chats drawer plus its footer: model, the exit readout, Settings and Proof. The phone pushes it as a route; the wide shell keeps it in the sidebar (§8.9). */
export function ChatsPane({ embedded = false, onClose }: { embedded?: boolean; onClose: () => void }) {
  const s = useAppServices();
  const router = useRouter();
  const { t } = useTranslation();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const mode = useLayoutMode();
  /* In the sidebar the list stays put: opening a chat only changes what the column shows. */
  const after = embedded ? () => undefined : onClose;
  return (
    <View style={[styles.root, { backgroundColor: theme.bg }]}>
      <View style={styles.list}>
        <Chats
          store={s.store}
          embedded={embedded}
          activeChatId={s.active.id}
          onClose={onClose}
          onOpenChat={(chat) => {
            s.openChat(chat);
            after();
          }}
          onNewChat={(incognito, personaId) => {
            s.newChat(incognito, personaId);
            after();
          }}
          onDeleted={s.chatDeleted}
          onOpenPaywall={() => router.push("/paywall")}
          autoDeleteDays={s.prefs.autoDeleteDays}
          version={s.chatsVersion}
        />
      </View>
      <View testID="drawer-footer" style={[styles.footer, { borderTopColor: theme.border, backgroundColor: theme.bg, paddingBottom: insets.bottom + 8 }]}>
        <View style={styles.readout}>
          <ChipGlyph size={12} color={theme.text2} />
          <Mono testID="drawer-meter" color={theme.text2}>{`${meterLabel(s.engine.model.id, t("onboarding.model.none"))} · OUT ${formatBytes(s.meter.out)}`}</Mono>
        </View>
        {/* The sidebar is the only place the five §8.9 sections live; the phone drawer keeps the two links it shipped with. */}
        {embedded ? (
          <View style={styles.links}>
            <Link testID="drawer-vault" label={t("vault.title")} onPress={() => router.push("/vault")} />
            <Link testID="drawer-documents" label={t("documents.title")} onPress={() => (hasPanel(mode) ? openSidePanel({ kind: "documents" }) : router.push("/documents"))} />
          </View>
        ) : null}
        <View style={styles.links}>
          <Link testID="drawer-settings" label={t("settings.title")} onPress={() => router.push("/settings")} />
          <Link testID="drawer-proof" label={`◯ ${t("proof.title")}`} onPress={() => router.push("/proof")} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  list: { flex: 1 },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 16, paddingTop: 8, gap: 4 },
  readout: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 28 },
  links: { flexDirection: "row", gap: 24 },
  link: { minHeight: 44, justifyContent: "center" },
});
