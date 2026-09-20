import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { formatBytes } from "@inborn/core";

import { useAppServices } from "../services/AppServices";
import { useTheme } from "../services/theme";
import { Chats } from "../screens/Chats";
import { Mono } from "../components/shell/primitives";
import { ChipGlyph } from "../components/shell/ChipGlyph";
import { useType } from "../services/type";
import { meterLabel } from "../lib/models";

/** S20: the chats drawer plus its footer: model, the exit readout, Settings and Proof. */
export default function ChatsRoute() {
  const s = useAppServices();
  const router = useRouter();
  const { t } = useTranslation();
  const { theme } = useTheme();
  const type = useType();
  const insets = useSafeAreaInsets();
  const back = () => (router.canGoBack() ? router.back() : router.replace("/"));
  return (
    <View style={[styles.root, { backgroundColor: theme.bg }]}>
      <View style={styles.list}>
        <Chats
          store={s.store}
          activeChatId={s.active.id}
          onClose={back}
          onOpenChat={(chat) => {
            s.openChat(chat);
            back();
          }}
          onNewChat={(incognito, personaId) => {
            s.newChat(incognito, personaId);
            back();
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
        <View style={styles.links}>
          <Pressable testID="drawer-settings" accessibilityRole="button" onPress={() => router.push("/settings")} style={styles.link}>
            <Text style={[type.bodySmall, type.strong, { color: theme.text }]}>{t("settings.title")}</Text>
          </Pressable>
          <Pressable testID="drawer-proof" accessibilityRole="button" onPress={() => router.push("/proof")} style={styles.link}>
            <Text style={[type.bodySmall, type.strong, { color: theme.text }]}>◯ {t("proof.title")}</Text>
          </Pressable>
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
