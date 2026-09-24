import { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { architectureStatement, type Folder } from "@inborn/core";
import { useTheme } from "../../services/theme";
import { useAppServices } from "../../services/AppServices";
import { Screen } from "../../components/shell/Screen";
import { Actions, Button } from "../../components/shell/primitives";
import { Markdown } from "../../components/chat/Markdown";
import { useType } from "../../services/type";
import { useEntitlement } from "../../licence";
import { shareFile } from "../../lib/share";
import { modelNames } from "../../lib/models";
import { useWork, useWorkGate, WorkTag } from "../../work";
import { appVersion, buildHash, statementPlatform } from "../../work/appInfo";

/** Settings → Pro for Work → Architecture statement: dated Markdown for a compliance file, shared/printed through the OS (§7.5 Work). */
export function Statement() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const type = useType();
  const { store, engine } = useAppServices();
  const { work, version } = useWork();
  const gate = useWorkGate();
  const { tier } = useEntitlement();
  const [folders, setFolders] = useState<Folder[]>([]);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  useEffect(() => {
    void store.library.listFolders().then(setFolders);
    void work.publicKeyIfAny().then(setPublicKey);
  }, [store, work, version]);

  const now = new Date();
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const body = useMemo(
    () =>
      architectureStatement({
        appVersion: appVersion(),
        ...(buildHash() ? { buildHash: buildHash() } : {}),
        platform: statementPlatform(),
        date,
        tier,
        modelName: modelNames()[engine.model.id] ?? engine.model.id,
        vaults: work.records().map((r) => folders.find((f) => f.id === r.folderId)?.name ?? r.folderId),
        ...(publicKey ? { signingPublicKeyHex: publicKey } : {}),
      }),
    [date, tier, engine.model.id, work, folders, publicKey, version],
  );
  const preview = gate.statementLocked ? body.split("\n").slice(0, 14).join("\n") + "\n\n…" : body;

  return (
    <Screen header={{ back: true, title: t("statement.title") }} testID="statement">
      {gate.statementLocked ? (
        <View style={[styles.moment, { borderColor: theme.border, backgroundColor: theme.surface1 }]}>
          <Text style={[type.bodySmall, styles.grow, { color: theme.text2 }]}>{t("work.moment.statement", { price: gate.price })}</Text>
          <WorkTag reason="architectureStatement" />
        </View>
      ) : (
        <Actions>
          <Button testID="statement-share" title={t("statement.share")} onPress={() => void shareFile({ filename: `inborn-architecture-statement-${date}.md`, mimeType: "text/markdown", body }, t("statement.dialog"))} />
        </Actions>
      )}
      <View style={styles.body}>
        <Markdown testID="statement-body" source={preview} direction="ltr" />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  moment: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderWidth: 1, borderRadius: 12, marginBottom: 12 },
  grow: { flex: 1 },
  body: { paddingTop: 12, paddingBottom: 32 },
});
