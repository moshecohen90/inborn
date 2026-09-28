import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { formatModelBytes } from "@inborn/core";
import { Screen } from "../../components/shell/Screen";
import { Actions, Button, Mono, MonoLabel, shellStyles } from "../../components/shell/primitives";
import { ChipGlyph } from "../../components/shell/ChipGlyph";
import { useTheme } from "../../services/theme";
import { useType } from "../../services/type";
import { onStoredModels, refreshStoredModels, removeWebModel, switchWebModel, webBoot, webStoredState } from "../../web/boot";
import { storedLine } from "../../web/storedModels";
import { ModelOptions } from "../../web/ModelOptions";
import { roomNoteParams } from "../../lib/modelSheetLines";
import { StoreBadges } from "../../web/StoreBadges";
import { storageEstimate, type StorageEstimate } from "../../web/opfs";
import { ExtensionsSection } from "../../components/ExtensionsSection";

import type { VaultEntryProps } from "./VaultEntry";

/** S30 on the web (spec §8.9, §14.3): the browser tier runs one model and keeps every one it downloaded until it is removed here. Metro never bundles the native screen (llama.rn) for the web. */
export function VaultEntry({ onClose }: VaultEntryProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const type = useType();
  const boot = webBoot();
  const [estimate, setEstimate] = useState<StorageEstimate | null>(null);
  const [, setWalks] = useState(0);
  useEffect(() => {
    const reread = () => void storageEstimate().then(setEstimate).catch(() => setEstimate(null));
    const off = onStoredModels(() => {
      setWalks((n) => n + 1);
      reread();
    });
    reread();
    /* A download that finished after this page loaded is on disk now; the rows follow the disk, not the load. */
    void refreshStoredModels();
    return off;
  }, []);
  const chrome = boot.engine === "chrome-nano";
  /* The engine is chosen once per page load, so a switch hands the page to the chat root, where the door delivers the pick. */
  const switchTo = (id: string) => void switchWebModel(id, { to: "/vault" });
  const current = boot.source && !chrome ? webStoredState(boot, boot.source.id) : null;
  const currentLine = current && current.kind !== "missing" ? storedLine(current, formatModelBytes) : null;
  const othersHere = boot.choices.some((c) => c.source.id !== boot.source?.id);
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
        {boot.source && !chrome ? (
          <Mono testID="vault-web-current" color={theme.text3}>
            {currentLine ? t(currentLine.key, currentLine.params) : formatModelBytes(boot.source.bytes)}
          </Mono>
        ) : null}
        {current?.kind === "in-use" && othersHere ? <Text style={[type.bodySmall, { color: theme.text2 }]}>{t("vault.web.inUseStays")}</Text> : null}
        {estimate && estimate.quota != null ? <Mono color={theme.text3}>{t("vault.web.storage", { used: formatModelBytes(estimate.usage ?? 0), free: formatModelBytes(Math.max(0, estimate.quota - (estimate.usage ?? 0))) })}</Mono> : null}
      </View>
      <Text style={[type.bodySmall, { color: theme.text2 }]}>{t("vault.web.explain")}</Text>
      {/* The same list the door offers (F312), each row as the OPFS walk finds it (F445). */}
      {!chrome && boot.roomNote ? (
        <Text testID="room-note" style={[type.bodySmall, { color: theme.text2 }]}>
          {t("models.roomNote", roomNoteParams(boot.roomNote))}
        </Text>
      ) : null}
      {chrome ? null : (
        <ModelOptions choices={boot.choices} currentId={boot.source?.id ?? null} onChoose={switchTo} theme={theme} open stateOf={(id) => webStoredState(boot, id)} onRemove={(id) => void removeWebModel(id)} />
      )}
      {chrome ? null : <ExtensionsSection theme={theme} />}
      <Text style={[type.bodySmall, { color: theme.text2 }]}>{t("vault.web.fullVault")}</Text>
      {/* The only thing this screen can do for a browser reader is the filled button; closing is the aside (QA F252). */}
      <Actions>
        {noCatalog ? <Button testID="vault-catalog-retry" title={t("web.catalog.retry")} onPress={() => location.reload()} /> : null}
        <StoreBadges testID="vault-get-app" />
        <Button variant="link" title={t("vault.close")} onPress={onClose} testID="close-vault" />
      </Actions>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
});
