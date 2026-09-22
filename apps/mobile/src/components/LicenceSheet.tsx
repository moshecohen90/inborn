import { Linking, ScrollView, StyleSheet, Text } from "react-native";
import { useTranslation } from "react-i18next";
import { licenceText } from "@inborn/core";
import { useTheme } from "../services/theme";
import { useType } from "../services/type";
import { Button } from "./shell/primitives";
import { Sheet } from "./shell/Sheet";
import type { LicenceSubject } from "../lib/modelLicence";

export type { LicenceSubject };

/**
 * F54 · the full licence text, read on the device with no network (§11.4, §11.5 item 5). A licence we ship no
 * text for offers its link instead, which is the only honest thing a plane-mode app can do for it.
 *
 * `onAccept` turns the sheet into the acceptance tap an import needs before it downloads someone else's weights.
 */
export function LicenceSheet({ visible, subject, onClose, onAccept }: { visible: boolean; subject: LicenceSubject | null; onClose: () => void; onAccept?: () => void }) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const type = useType();
  const text = subject ? licenceText(subject.license, subject.attribution) : null;
  return (
    <Sheet visible={visible && subject !== null} onClose={onClose} title={subject ? t("licenses.sheet.title", { name: subject.name }) : ""} testID="licence-sheet">
      <Text style={[type.mono, { color: theme.text3 }]}>{subject?.license}</Text>
      {text ? (
        <ScrollView style={styles.body}>
          <Text testID="licence-text" selectable style={[type.mono, { color: theme.text2 }]}>
            {text}
          </Text>
        </ScrollView>
      ) : (
        <Text testID="licence-no-text" style={[type.bodySmall, { color: theme.text2 }]}>
          {t("licenses.sheet.noText")}
        </Text>
      )}
      {subject?.licenseUrl ? <Button title={t("licenses.sheet.open")} variant="link" onPress={() => void Linking.openURL(subject.licenseUrl!)} /> : null}
      {onAccept ? <Button testID="licence-accept" title={t("licenses.sheet.accept")} onPress={onAccept} /> : null}
      <Button title={t(onAccept ? "chats.cancel" : "vault.close")} variant={onAccept ? "link" : "secondary"} onPress={onClose} />
    </Sheet>
  );
}

const styles = StyleSheet.create({ body: { flexGrow: 0, maxHeight: 320 } });
