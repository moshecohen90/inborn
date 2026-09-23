import { useEffect, useState } from "react";
import { Linking, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Screen } from "../../components/shell/Screen";
import { Actions, Button, Mono, MonoLabel, shellStyles } from "../../components/shell/primitives";
import { ChipGlyph } from "../../components/shell/ChipGlyph";
import { useTheme } from "../../services/theme";
import { useType } from "../../services/type";
import { webBoot } from "../../web/boot";
import { GET_APP_URL } from "../../web/WebShell";
import { formatBytes } from "../../web/format";
import { storageEstimate, type StorageEstimate } from "../../web/opfs";

import type { VaultEntryProps } from "./VaultEntry";

/** S30 on the web (spec §8.9, §14.3): no vault here; the browser tier holds one model in its own private storage. Metro never bundles the native screen (llama.rn) for the web. */
export function VaultEntry({ onClose }: VaultEntryProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const type = useType();
  const boot = webBoot();
  const [estimate, setEstimate] = useState<StorageEstimate | null>(null);
  useEffect(() => {
    storageEstimate().then(setEstimate).catch(() => setEstimate(null));
  }, []);
  const chrome = boot.engine === "chrome-nano";
  const status = chrome ? t("vault.web.status.chrome") : boot.status.kind === "ready" ? t("vault.web.status.ready") : boot.status.kind === "partial" ? t("vault.web.status.partial") : t("vault.web.status.missing");
  return (
    <Screen header={{ back: true, title: t("vault.title"), onBack: onClose }} mesh testID="vault-web-door">
      <View style={[shellStyles.card, { borderColor: theme.border, backgroundColor: theme.surface1 }]}>
        <View style={styles.row}>
          <ChipGlyph size={14} color={theme.text2} />
          <MonoLabel color={theme.text2}>{t("vault.web.managed")}</MonoLabel>
        </View>
        <Text style={[type.heading, { color: theme.text }]}>{chrome ? t("web.engine.chrome") : (boot.source?.name ?? t("vault.web.noModel"))}</Text>
        <Text testID="vault-web-status" style={[type.bodySmall, { color: theme.text2 }]}>
          {status}
        </Text>
        {boot.source && !chrome ? <Mono color={theme.text3}>{t("vault.web.size", { size: formatBytes(boot.source.bytes), file: boot.source.file })}</Mono> : null}
        {estimate && estimate.quota != null ? <Mono color={theme.text3}>{t("vault.web.storage", { used: formatBytes(estimate.usage ?? 0), free: formatBytes(Math.max(0, estimate.quota - (estimate.usage ?? 0))) })}</Mono> : null}
      </View>
      <Text style={[type.bodySmall, { color: theme.text2 }]}>{t("vault.web.explain")}</Text>
      <Text style={[type.bodySmall, { color: theme.text2 }]}>{t("vault.web.fullVault")}</Text>
      {/* The only thing this screen can do for a browser reader is the filled button; closing is the aside (QA F252). */}
      <Actions>
        <Button testID="vault-get-app" title={t("web.getApp")} onPress={() => void Linking.openURL(GET_APP_URL)} />
        <Button variant="link" title={t("vault.close")} onPress={onClose} testID="close-vault" />
      </Actions>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
});
