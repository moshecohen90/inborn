import { useEffect, useState } from "react";
import { Linking, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { formatModelBytes } from "@inborn/core";
import { Screen } from "../../components/shell/Screen";
import { Actions, Button, Mono, MonoLabel, shellStyles } from "../../components/shell/primitives";
import { ChipGlyph } from "../../components/shell/ChipGlyph";
import { useTheme } from "../../services/theme";
import { useType } from "../../services/type";
import { chooseWebModel, webBoot } from "../../web/boot";
import { ModelOptions } from "../../web/ModelOptions";
import { roomNoteParams } from "../../lib/modelSheetLines";
import { GET_APP_URL } from "../../web/WebShell";
import { storageEstimate, type StorageEstimate } from "../../web/opfs";

import type { VaultEntryProps } from "./VaultEntry";

/** S30 on the web (spec §8.9, §14.3): the browser tier holds one model at a time in its own private storage, and this screen is where it is swapped. Metro never bundles the native screen (llama.rn) for the web. */
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
  /* The engine is chosen once per page load, so a switch hands the page to the chat root, where the door delivers the pick. */
  const switchTo = async (id: string) => {
    if (await chooseWebModel(id)) location.assign("/");
  };
  /* No catalog is not "not downloaded yet": that line sent the reader to a chat screen with nothing to offer (B1). */
  const noCatalog = !chrome && !boot.source && !!boot.catalogError;
  const status = chrome
    ? t("vault.web.status.chrome")
    : noCatalog
      ? t("web.catalog.explain")
      : boot.status.kind === "ready"
        ? t("vault.web.status.ready")
        : boot.status.kind === "partial"
          ? t("vault.web.status.partial")
          : t("vault.web.status.missing");
  return (
    <Screen header={{ back: true, title: t("vault.title"), onBack: onClose }} mesh testID="vault-web-door">
      <View style={[shellStyles.card, { borderColor: theme.border, backgroundColor: theme.surface1 }]}>
        <View style={styles.row}>
          <ChipGlyph size={14} color={theme.text2} />
          <MonoLabel color={theme.text2}>{t("vault.web.managed")}</MonoLabel>
        </View>
        <Text style={[type.heading, { color: theme.text }]}>{chrome ? t("web.engine.chrome") : noCatalog ? t("web.catalog.title") : (boot.source?.name ?? t("vault.web.noModel"))}</Text>
        <Text testID="vault-web-status" style={[type.bodySmall, { color: theme.text2 }]}>
          {status}
        </Text>
        {boot.source && !chrome ? <Mono color={theme.text3}>{t("vault.web.size", { size: formatModelBytes(boot.source.bytes), file: boot.source.file })}</Mono> : null}
        {estimate && estimate.quota != null ? <Mono color={theme.text3}>{t("vault.web.storage", { used: formatModelBytes(estimate.usage ?? 0), free: formatModelBytes(Math.max(0, estimate.quota - (estimate.usage ?? 0))) })}</Mono> : null}
      </View>
      <Text style={[type.bodySmall, { color: theme.text2 }]}>{t("vault.web.explain")}</Text>
      {/* The browser runs one model at a time, but which one is the reader's call: the same list the door offers (F312). */}
      {!chrome && boot.roomNote ? (
        <Text testID="room-note" style={[type.bodySmall, { color: theme.text2 }]}>
          {t("models.roomNote", roomNoteParams(boot.roomNote))}
        </Text>
      ) : null}
      {chrome ? null : <ModelOptions choices={boot.choices} currentId={boot.source?.id ?? null} onChoose={(id) => void switchTo(id)} theme={theme} open />}
      <Text style={[type.bodySmall, { color: theme.text2 }]}>{t("vault.web.fullVault")}</Text>
      {/* The only thing this screen can do for a browser reader is the filled button; closing is the aside (QA F252). */}
      <Actions>
        {noCatalog ? <Button testID="vault-catalog-retry" title={t("web.catalog.retry")} onPress={() => location.reload()} /> : null}
        <Button testID="vault-get-app" variant={noCatalog ? "secondary" : "cta"} title={t("web.getApp")} onPress={() => void Linking.openURL(GET_APP_URL)} />
        <Button variant="link" title={t("vault.close")} onPress={onClose} testID="close-vault" />
      </Actions>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
});
