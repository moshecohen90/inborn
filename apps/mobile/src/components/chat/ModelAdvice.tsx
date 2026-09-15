import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { radius, type Theme } from "@inborn/ui";
import { LANGUAGE_NAME_BY_CODE, formatModelBytes, languageRank, type ModelAdvice } from "@inborn/core";
import { modelLabel } from "../../lib/models";
import { useType } from "../../services/type";
import { shape } from "./styles";

export interface ModelAdviceCardProps {
  advice: ModelAdvice;
  theme: Theme;
  /** The offered model is Pro-only and this tier cannot install it: the Install button carries the PRO tag and opens the paywall. */
  locked?: boolean;
  onSwitch: (id: string) => void;
  onInstall: (id: string) => void;
  onNotNow: () => void;
}

/** §7.8 "recommended model": one compact card that says in plain words why another model would serve this chat better. */
export function ModelAdviceCard({ advice, theme, locked, onSwitch, onInstall, onNotNow }: ModelAdviceCardProps) {
  const type = useType();
  const { t } = useTranslation();
  const current = modelLabel(advice.current.id);
  const better = modelLabel(advice.better.model.id);
  const languageName = (code: string) => t(`language.${code}`, { defaultValue: LANGUAGE_NAME_BY_CODE[code] ?? code });
  const language = advice.language ? languageName(advice.language.code) : "";
  const useName = (use: string) => t(`use.${use}`);
  /* "basic" never says "handles Hebrew better" alone: the offer is better than nothing, not fluent (§7.8). */
  const gap = advice.language ? (advice.language.to === "basic" ? "basic" : languageRank(advice.language.to) - languageRank(advice.language.from) >= 2 ? "big" : "small") : "small";
  const reason =
    advice.language && advice.use
      ? gap === "basic"
        ? `${t("chat.modelAdvice.language", { better, current, language, gap })} ${t("chat.modelAdvice.use", { better, current, use: advice.use.use })}`
        : t("chat.modelAdvice.both", { better, current, language, use: advice.use.use })
      : advice.language
        ? t("chat.modelAdvice.language", { better, current, language, gap })
        : t("chat.modelAdvice.use", { better, current, use: advice.use?.use ?? "chat" });
  const bestReason = advice.language ? language : useName(advice.use?.use ?? "chat");
  const installed = advice.better.reason.installed;
  return (
    <View testID="model-advice" style={[styles.card, { backgroundColor: theme.surface1, borderColor: theme.border }]}>
      <Text testID="model-advice-reason" style={[type.bodySmall, { color: theme.text }]}>
        {reason}
      </Text>
      {advice.best ? (
        <Pressable testID="model-advice-best" accessibilityRole="button" onPress={() => onInstall(advice.best!.model.id)} hitSlop={6}>
          <Text style={[type.caption, { color: theme.text2 }]}>{t("chat.modelAdvice.best", { model: modelLabel(advice.best.model.id), reason: bestReason, size: formatModelBytes(advice.best.model.bytes) })}</Text>
        </Pressable>
      ) : null}
      <View style={styles.actions}>
        <Pressable testID={installed ? "model-advice-switch" : "model-advice-install"} accessibilityRole="button" onPress={() => (installed ? onSwitch(advice.better.model.id) : onInstall(advice.better.model.id))} style={[styles.btn, { backgroundColor: theme.ctaFill }]}>
          <Text numberOfLines={1} style={[type.bodySmall, type.strong, { color: theme.ctaText }]}>
            {installed ? t("chat.modelAdvice.switch", { model: better }) : t("chat.modelAdvice.install", { model: better, size: formatModelBytes(advice.better.model.bytes) })}
          </Text>
        </Pressable>
        {!installed && locked ? (
          <View style={[shape.chip, { borderColor: theme.accent, minHeight: 22 }]}>
            <Text style={[type.monoLabel, { color: theme.accent }]}>{t("vault.pro")}</Text>
          </View>
        ) : null}
        <Pressable testID="model-advice-not-now" accessibilityRole="button" onPress={onNotNow} hitSlop={8} style={styles.textBtn}>
          <Text style={[type.bodySmall, { color: theme.text2 }]}>{t("chat.modelAdvice.notNow")}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: 16, marginTop: 8, padding: 12, gap: 8, borderWidth: 1, borderRadius: radius.card },
  actions: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 10 },
  btn: { minHeight: 36, paddingHorizontal: 12, borderRadius: radius.control, alignItems: "center", justifyContent: "center", maxWidth: "100%" },
  textBtn: { minHeight: 36, justifyContent: "center", paddingHorizontal: 4 },
});
