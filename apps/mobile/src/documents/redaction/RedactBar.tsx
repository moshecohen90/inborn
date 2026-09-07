import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { shape } from "../../components/chat/styles";
import { useTheme } from "../../lib/theme";
import { useType } from "../../services/type";

interface Props {
  /** The composer has text: the Redact chip is offered. */
  hasDraft: boolean;
  /** A paste above PASTE_OFFER_CHARS landed in the draft: the chip turns amber and says so. */
  pasteOffer: boolean;
  /** This chat redacted something: the reveal toggle is shown. */
  active: boolean;
  reveal: boolean;
  onOpen: () => void;
  onToggleReveal: () => void;
}

/** Chip row above the composer (§7.3 Work): "Redact" before sending, "Show originals" once something was redacted. */
export function RedactBar({ hasDraft, pasteOffer, active, reveal, onOpen, onToggleReveal }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const type = useType();
  if (!hasDraft && !active) return null;
  return (
    <View testID="redact-bar" style={styles.row}>
      {hasDraft ? (
        <Pressable testID="redact-open" accessibilityRole="button" onPress={onOpen} style={[shape.chip, styles.chip, { backgroundColor: pasteOffer ? theme.surface1 : theme.surface2, borderColor: pasteOffer ? theme.accent : theme.border }]}>
          <Text style={[type.caption, { color: pasteOffer ? theme.accent : theme.text2 }]}>{pasteOffer ? t("redact.bar.pasted") : t("redact.bar.redact")}</Text>
        </Pressable>
      ) : null}
      {active ? (
        <Pressable testID="redact-reveal" accessibilityRole="switch" accessibilityState={{ checked: reveal }} onPress={onToggleReveal} style={[shape.chip, styles.chip, { backgroundColor: theme.surface2, borderColor: reveal ? theme.accent : theme.border }]}>
          <Text style={[type.caption, { color: reveal ? theme.accent : theme.text2 }]}>{reveal ? t("redact.bar.hide") : t("redact.bar.show")}</Text>
        </Pressable>
      ) : null}
      {active ? <Text style={[type.monoLabel, styles.tag, { color: theme.text3 }]}>{t("redact.bar.tag")}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6, paddingHorizontal: 12, paddingBottom: 4 },
  chip: { borderWidth: 1 },
  tag: { marginLeft: 4 },
});
