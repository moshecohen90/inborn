import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { formatModelBytes } from "@inborn/core";
import { joinList } from "@inborn/i18n";
import { Icon, MIN_TOUCH, radius, type Theme } from "@inborn/ui";
import { font } from "../services/type";
import { deviceNoun } from "../lib/deviceNoun";
import { modelCopy } from "../lib/models";
import { languagesLine } from "../screens/Onboarding/modelStep";
import type { WebModelChoice } from "./modelChoice";

export interface ModelOptionsProps {
  choices: readonly WebModelChoice[];
  /** The model the door is offering right now; its row is marked, not offered again. */
  currentId: string | null;
  onChoose: (id: string) => void;
  theme: Theme;
  /** Open on first render (the vault, where the list is the screen's subject). The door folds it away. */
  open?: boolean;
  /** No switching while a download runs: the worker holds one job. */
  disabled?: boolean;
}

/**
 * The other models this browser can run (Moshe, 24.9: recommend the best one for the device, and offer the rest
 * below it). One list for the download door, the browser vault and the onboarding step, so the three cannot
 * disagree about what is on offer here. Every number comes from the catalog: size, measured speed, languages.
 */
export function ModelOptions({ choices, currentId, onChoose, theme, open: initialOpen = false, disabled }: ModelOptionsProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(initialOpen);
  const others = choices.filter((c) => c.source.id !== currentId);
  if (!others.length) return null;
  return (
    <View testID="web-model-options" style={styles.wrap}>
      <Pressable testID="web-model-options-toggle" accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen((o) => !o)} style={styles.toggle}>
        <Icon name={open ? "chevronDown" : "chevronRight"} size={14} color={theme.text2} />
        <Text style={[styles.caption, styles.strong, { color: theme.text2 }]}>{t("web.models.more", { count: others.length })}</Text>
      </Pressable>
      {open
        ? others.map((choice) => <OptionRow key={choice.source.id} choice={choice} theme={theme} onChoose={onChoose} disabled={disabled} />)
        : null}
    </View>
  );
}

function OptionRow({ choice, theme, onChoose, disabled }: { choice: WebModelChoice; theme: Theme; onChoose: (id: string) => void; disabled?: boolean }) {
  const { t, i18n } = useTranslation();
  const { source, model, speed, languages, installed, recommended } = choice;
  const names = languagesLine(languages.map((c) => t(`language.${c}`, { defaultValue: c })));
  return (
    <View testID={`web-model-${source.id}`} style={[styles.row, { borderColor: theme.border, backgroundColor: theme.surface1 }]}>
      <View style={styles.rowHead}>
        <Text style={[styles.name, { color: theme.text }]}>{source.name}</Text>
        <Text style={[styles.mono, { color: theme.text3 }]}>{formatModelBytes(source.bytes)}</Text>
      </View>
      {recommended || installed ? (
        <Text style={[styles.monoLabel, { color: recommended ? theme.accent : theme.sealed }]}>{recommended ? t("models.recommended", { device: deviceNoun() }) : t("vault.installed")}</Text>
      ) : null}
      {model ? <Text style={[styles.caption, { color: theme.text2 }]}>{modelCopy(t, model, { photos: false }).goodFor}</Text> : null}
      <Text testID={`web-model-speed-${source.id}`} style={[styles.mono, { color: theme.text3 }]}>
        {speed ? t("vault.speed", { min: speed[0], max: speed[1], device: deviceNoun() }) : t("vault.speedUnknown", { device: deviceNoun() })}
      </Text>
      {names.list.length ? (
        <Text style={[styles.caption, { color: theme.text3 }]}>
          {names.more ? t("onboarding.model.languagesMore", { list: joinList(i18n.language, names.list), count: names.more }) : t("onboarding.model.languages", { list: joinList(i18n.language, names.list) })}
        </Text>
      ) : null}
      <Pressable
        testID={`web-model-choose-${source.id}`}
        accessibilityRole="button"
        disabled={disabled}
        onPress={() => onChoose(source.id)}
        style={[styles.choose, { borderColor: theme.border, opacity: disabled ? 0.5 : 1 }]}
      >
        <Text style={[styles.caption, styles.strong, { color: theme.text }]}>{installed ? t("vault.use") : t("web.models.choose", { size: formatModelBytes(source.bytes) })}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  toggle: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: MIN_TOUCH },
  row: { borderWidth: 1, borderRadius: radius.card, padding: 12, gap: 4 },
  rowHead: { flexDirection: "row", alignItems: "baseline", gap: 8 },
  name: { ...font("sans", "600"), fontSize: 15, flex: 1 },
  caption: { ...font("sans"), fontSize: 12, lineHeight: 16 },
  strong: { fontWeight: "600" },
  mono: { ...font("mono"), fontSize: 11, letterSpacing: 0.3 },
  monoLabel: { ...font("mono", "500"), fontSize: 10, letterSpacing: 0.9, textTransform: "uppercase" },
  choose: { minHeight: MIN_TOUCH, marginTop: 4, paddingHorizontal: 14, borderWidth: 1, borderRadius: radius.control, alignItems: "center", justifyContent: "center" },
});
