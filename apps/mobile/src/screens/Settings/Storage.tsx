import { useEffect, useState } from "react";
import { Platform, StyleSheet, Text } from "react-native";
import { useTranslation } from "react-i18next";
import { formatBytes } from "@inborn/core";
import { useTheme } from "../../services/theme";
import { useAppServices } from "../../services/AppServices";
import { Screen } from "../../components/shell/Screen";
import { Button, Row, Section } from "../../components/shell/primitives";
import { Sheet } from "../../components/shell/Sheet";
import { WipeSheet } from "./WipeSheet";
import { storageSizes, type StorageSizes } from "./storageSizes";
import { useType } from "../../services/type";

/** S51: what is stored, where, how much, and how to delete or export it. Export/transfer arrive with Pro (M6). */
export function Storage() {
  const type = useType();
  const { t } = useTranslation();
  const { theme } = useTheme();
  const { store, storageKind } = useAppServices();
  const [sizes, setSizes] = useState<StorageSizes | null>(null);
  const [confirmChats, setConfirmChats] = useState(false);
  const [wipeOpen, setWipeOpen] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    storageSizes()
      .then((s) => {
        if (alive) setSizes(s);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [tick]);

  const deleteChats = async () => {
    const chats = await store.listChats();
    for (const c of chats) await store.deleteChat(c.id);
    setConfirmChats(false);
    setTick((n) => n + 1);
  };
  const size = (n: number | null | undefined) => (n === null || n === undefined ? "—" : formatBytes(n));

  return (
    <Screen header={{ back: true, title: t("storage.title") }} testID="storage">
      <Section title={t("storage.stored")}>
        <Row testID="storage-chats" label={t("storage.chats")} sub={storageKind === "sqlcipher" ? t("storage.chats.encrypted") : t("storage.chats.memory")} value={size(sizes?.chats)} />
        <Row label={t("storage.documents")} value={size(sizes?.documents)} />
        <Row label={t("storage.models")} sub={t("storage.models.sub")} value={size(sizes?.models)} />
        <Row label={t("storage.memory")} value={size(sizes?.memory)} />
        <Row label={t("storage.reports")} value={size(sizes?.reports)} />
      </Section>
      <Text testID="storage-backup" style={[type.bodySmall, styles.note, { color: theme.text2 }]}>{t(Platform.OS === "web" ? "storage.backup.web" : Platform.OS === "android" ? "storage.backup.android" : "storage.backup")}</Text>
      <Text style={[type.bodySmall, { color: theme.text3 }]}>{t("storage.noSync")}</Text>
      <Section title={t("storage.actions")}>
        <Row testID="storage-delete-chats" label={t("storage.deleteChats")} onPress={() => setConfirmChats(true)} danger chevron />
        <Row testID="storage-delete-all" label={t("storage.deleteEverything")} sub={t("wipe.row")} onPress={() => setWipeOpen(true)} danger chevron />
      </Section>
      <Sheet visible={confirmChats} onClose={() => setConfirmChats(false)} title={t("storage.deleteChats")}>
        <Text style={[type.bodySmall, { color: theme.text2 }]}>{t("storage.deleteChats.explain")}</Text>
        <Button title={t("storage.deleteChats")} variant="danger" onPress={() => void deleteChats()} />
        <Button title={t("chats.cancel")} variant="link" onPress={() => setConfirmChats(false)} />
      </Sheet>
      <WipeSheet visible={wipeOpen} onClose={() => setWipeOpen(false)} />
    </Screen>
  );
}

const styles = StyleSheet.create({ note: { paddingTop: 16 } });
