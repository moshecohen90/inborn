import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Icon, radius, type Theme } from "@inborn/ui";
import { PAYWALL_BULLETS, type Offer, type Price } from "@inborn/core";
import { useType } from "../../services/type";

export interface TierCardProps {
  offer: Offer;
  price: Price;
  theme: Theme;
  /** The main card on this platform (Pro on phones, Work on desktop): CTA fill, larger price. */
  primary: boolean;
  busy: boolean;
  disabled: boolean;
  onBuy: () => void;
}

/** One S60 card (spec §8.7): tier, "{price} · one-time purchase", six value lines, one button. */
export function TierCard({ offer, price, theme, primary, busy, disabled, onBuy }: TierCardProps) {
  const type = useType();
  const { t } = useTranslation();
  const isWork = offer.tier === "work";
  const cta = isWork ? (offer.variant === "upgrade" ? t("paywall.upgradeWork", { price: price.display }) : t("paywall.unlockWork", { price: price.display })) : t("paywall.unlockPro", { price: price.display });
  return (
    <View testID={`tier-${offer.productId}`} style={[styles.card, { borderColor: primary ? theme.text2 : theme.border, backgroundColor: theme.surface1 }]}>
      {isWork ? <Text style={[type.monoLabel, { color: theme.accent }]}>{t("paywall.work.eyebrow")}</Text> : null}
      <View style={styles.head}>
        <Text style={[type.monoLabel, styles.tier, { color: theme.text, fontSize: Math.round(15 * type.scale), lineHeight: Math.round(20 * type.scale) }]}>{isWork ? t("paywall.work.name") : t("paywall.pro.name")}</Text>
        {offer.variant === "launch" ? <Text style={[type.monoLabel, styles.chip, { color: theme.accent, borderColor: theme.accent }]}>{t("paywall.launch")}</Text> : null}
        {offer.variant === "upgrade" ? <Text style={[type.monoLabel, styles.chip, { color: theme.text2, borderColor: theme.border }]}>{t("paywall.upgradeTag")}</Text> : null}
      </View>
      <Text testID={`price-${offer.productId}`} style={[type.title, { color: theme.text }]}>
        {t("paywall.priceLine", { price: price.display })}
      </Text>
      {price.fromStore ? null : <Text style={[type.mono, { color: theme.text3 }]}>{t("paywall.usdFallback")}</Text>}
      <View style={styles.bullets}>
        {PAYWALL_BULLETS[offer.tier].map((b) => (
          <View key={b} style={styles.bulletRow}>
            <Icon name="check" size={14} color={theme.text2} style={styles.bulletIcon} />
            <Text style={[type.bodySmall, { color: theme.text }]}>{t(`paywall.${offer.tier}.${b}`)}</Text>
          </View>
        ))}
      </View>
      <Pressable
        testID={`buy-${offer.productId}`}
        accessibilityRole="button"
        accessibilityLabel={cta}
        disabled={disabled || busy}
        onPress={onBuy}
        style={({ pressed }) => [styles.btn, primary ? { backgroundColor: theme.ctaFill } : { borderWidth: 1, borderColor: theme.text2 }, (pressed || disabled) && styles.dim]}
      >
        {busy ? <ActivityIndicator color={primary ? theme.ctaText : theme.text} /> : <Text style={[type.body, type.strong, { color: primary ? theme.ctaText : theme.text }]}>{cta}</Text>}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: radius.card, padding: 16, gap: 8 },
  head: { flexDirection: "row", alignItems: "center", gap: 8 },
  tier: { letterSpacing: 1.5 },
  chip: { borderWidth: 1, borderRadius: radius.chip, paddingHorizontal: 6, paddingVertical: 1 },
  bullets: { gap: 4, marginTop: 2 },
  bulletRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  bulletIcon: { marginTop: 3 },
  btn: { minHeight: 46, borderRadius: radius.control, alignItems: "center", justifyContent: "center", marginTop: 6, paddingHorizontal: 14 },
  dim: { opacity: 0.6 },
});
