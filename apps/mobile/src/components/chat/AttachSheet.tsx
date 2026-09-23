import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import type { DocumentRecord, PaywallReason } from "@inborn/core";
import { useTheme } from "../../lib/theme";
import { ProTag, Sheet, SheetItem } from "./Sheet";
import { shape } from "./styles";
import { useType } from "../../services/type";
import { Icon } from "@inborn/ui";
import { Toggle } from "../shell/primitives";
import { documentState } from "../../documents/stateText";
import { deviceNoun } from "../../lib/deviceNoun";

interface Props {
  visible: boolean;
  onClose: () => void;
  /** The whole library (S40); attached ids are ticked. */
  documents: DocumentRecord[];
  attachedIds: string[];
  strict: boolean;
  onSetStrict: (v: boolean) => void;
  /** "Answer only from my documents" is Pro (§7.3): the switch stays visible and opens the paywall. */
  strictLocked?: boolean;
  /** Free carries one file per chat (§7.3 row 1): the other rows stay tappable and say why. */
  attachLocked?: boolean;
  onUnlock?: (reason: PaywallReason) => void;
  onAttach: (docId: string) => void;
  onDetach: (docId: string) => void;
  onManage: () => void;
  /** "Add a file…": the system picker, routed by kind (Excel / HTML are Work, spec §7.3 row 8). */
  onImport?: () => void;
  /** Photo rows (§7.1 image input): absent on platforms without a picker. `note` explains a disabled state. */
  onPhoto?: (source: "library" | "camera") => void;
  photoNote?: string;
  photoDisabled?: boolean;
  /** The model that can look at photos is not the resident one (QA F36): one tap loads it and the rows come back. */
  onUseVisionModel?: () => void;
  visionModel?: string;
  /** The resident model can see but the projector is not installed: the row that was a dead end now fetches it (QA F137). */
  onInstallVision?: () => void;
  visionSize?: string;
  /** Opens the profession-pack templates library (§7.6, Work); the Work stream gates it inside. */
  onTemplates?: () => void;
}

/** The [+] sheet (§7.3, S12): pick documents for this chat, the strict switch, and the way to the library. */
export function AttachSheet({ visible, onClose, documents, attachedIds, strict, onSetStrict, strictLocked, attachLocked, onUnlock, onAttach, onDetach, onManage, onPhoto, photoNote, photoDisabled, onUseVisionModel, visionModel, onInstallVision, visionSize, onImport, onTemplates }: Props) {
  const type = useType();
  const theme = useTheme();
  const { t } = useTranslation();
  const indexed = (d: DocumentRecord) => d.chunkCount > 0;
  return (
    <Sheet visible={visible} onClose={onClose} title={t("chat.attach.title")} testID="attach-sheet">
      {onTemplates ? <SheetItem testID="attach-templates" label={t("templates.title")} hint={t("templates.hint")} onPress={onTemplates} trailing={<Icon name="chevronRight" size={18} color={theme.text2} />} /> : null}
      {onPhoto ? (
        <View style={[styles.photos, { borderColor: theme.border }]}>
          <Text style={[type.monoLabel, styles.sectionLabel, { color: theme.text3 }]}>{t("chat.attach.photos")}</Text>
          <SheetItem testID="attach-photo" label={t("chat.attach.photo")} hint={photoNote} disabled={photoDisabled} onPress={() => onPhoto("library")} trailing={<Icon name="image" size={18} color={theme.text2} />} />
          <SheetItem testID="attach-camera" label={t("chat.attach.camera")} disabled={photoDisabled} onPress={() => onPhoto("camera")} trailing={<Icon name="camera" size={18} color={theme.text2} />} />
          {onUseVisionModel && visionModel ? <SheetItem testID="attach-use-vision" label={t("chat.attach.useVisionModel", { model: visionModel })} onPress={onUseVisionModel} trailing={<Icon name="chevronRight" size={18} color={theme.text2} />} /> : null}
          {onInstallVision ? <SheetItem testID="attach-install-vision" label={t("chat.attach.installVision", { size: visionSize ?? "" })} onPress={onInstallVision} trailing={<Icon name="chevronRight" size={18} color={theme.text2} />} /> : null}
        </View>
      ) : null}
      {onImport ? <SheetItem testID="attach-import" label={t("chat.attach.import")} hint={t("chat.attach.importHint")} onPress={onImport} trailing={<Icon name="upload" size={18} color={theme.text2} />} /> : null}
      {documents.length ? (
        documents.map((d) => {
          const on = attachedIds.includes(d.id);
          const ready = indexed(d);
          const locked = !!attachLocked && !on;
          return (
            <SheetItem
              key={d.id}
              testID={`attach-${d.id}`}
              label={d.name}
              hint={locked ? t("quick.filePro") : documentState(d, t, deviceNoun()).text}
              disabled={!ready && !on && !locked}
              onPress={() => (locked ? onUnlock?.("document") : on ? onDetach(d.id) : onAttach(d.id))}
              trailing={
                locked ? (
                  <ProTag onPress={() => onUnlock?.("document")} />
                ) : (
                  <View testID={on ? `attached-${d.id}` : undefined} style={[styles.tick, { borderColor: on ? theme.accent : theme.border, backgroundColor: on ? theme.accent : "transparent" }]}>
                    {on ? <Icon name="check" size={14} color={theme.bg} strokeWidth={3} /> : null}
                  </View>
                )
              }
            />
          );
        })
      ) : (
        <Text style={[type.bodySmall, styles.empty, { color: theme.text3 }]}>{t("chat.attach.empty")}</Text>
      )}
      <View style={[styles.strictRow, { borderColor: theme.border }]}>
        <View style={styles.grow}>
          <Text style={[type.body, { color: theme.text }]}>{t("documents.strict.title")}</Text>
          <Text style={[type.caption, { color: theme.text3 }]}>{t("documents.strict.hint")}</Text>
        </View>
        {strictLocked ? <ProTag onPress={() => onUnlock?.("strictDocuments")} /> : null}
        <Toggle testID="attach-strict" label={t("documents.strict.title")} value={strict && !strictLocked} onChange={(v) => (strictLocked ? onUnlock?.("strictDocuments") : onSetStrict(v))} />
      </View>
      <Pressable testID="attach-manage" accessibilityRole="button" onPress={onManage} style={[shape.control, styles.manage, { borderColor: theme.border }]}>
        <Text style={[type.body, { color: theme.text }]}>{t("chat.attach.manage")}</Text>
      </Pressable>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  tick: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  empty: { paddingHorizontal: 12, paddingVertical: 12 },
  strictRow: { flexDirection: "row", alignItems: "center", gap: 12, marginHorizontal: 12, marginTop: 8, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  grow: { flex: 1, gap: 2 },
  manage: { marginHorizontal: 12, marginTop: 12, borderWidth: 1, alignItems: "center" },
  photos: { paddingBottom: 8, marginBottom: 4, borderBottomWidth: StyleSheet.hairlineWidth },
  sectionLabel: { paddingHorizontal: 16, paddingBottom: 4 },
});
