import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { fonts, radius, type Theme } from "@inborn/ui";
import { PAYWALL_BULLETS, type Offer, type Price } from "@inborn/core";

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
  const { t } = useTranslation();
  const isWork = offer.tier === "work";
  const cta = isWork ? (offer.variant === "upgrade" ? t("paywall.upgradeWork", { price: price.display }) : t("paywall.unlockWork", { price: price.display })) : t("paywall.unlockPro", { price: price.display });
  return (
    <View testID={`tier-${offer.productId}`} style={[styles.card, { borderColor: primary ? theme.text2 : theme.border, backgroundColor: theme.surface1 }]}>
      {isWork ? <Text style={[styles.eyebrow, { color: theme.accent }]}>{t("paywall.work.eyebrow")}</Text> : null}
      <View style={styles.head}>
        <Text style={[styles.tier, { color: theme.text }]}>{isWork ? t("paywall.work.name") : t("paywall.pro.name")}</Text>
        {offer.variant === "launch" ? <Text style={[styles.chip, { color: theme.accent, borderColor: theme.accent }]}>{t("paywall.launch")}</Text> : null}
        {offer.variant === "upgrade" ? <Text style={[styles.chip, { color: theme.text2, borderColor: theme.border }]}>{t("paywall.upgradeTag")}</Text> : null}
      </View>
      <Text testID={`price-${offer.productId}`} style={[styles.price, { color: theme.text }]}>
        {t("paywall.priceLine", { price: price.display })}
      </Text>
      {price.fromStore ? null : <Text style={[styles.mono, { color: theme.text3 }]}>{t("paywall.usdFallback")}</Text>}
      <View style={styles.bullets}>
        {PAYWALL_BULLETS[offer.tier].map((b) => (
          <Text key={b} style={[styles.bullet, { color: theme.text }]}>
            ✓ {t(`paywall.${offer.tier}.${b}`)}
          </Text>
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
        {busy ? <ActivityIndicator color={primary ? theme.ctaText : theme.text} /> : <Text style={[styles.btnText, { color: primary ? theme.ctaText : theme.text }]}>{cta}</Text>}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: radius.card, padding: 16, gap: 8 },
  eyebrow: { fontFamily: fonts.mono, fontSize: 11, letterSpacing: 1.2 },
  head: { flexDirection: "row", alignItems: "center", gap: 8 },
  tier: { fontFamily: fonts.mono, fontSize: 15, fontWeight: "700", letterSpacing: 1.5 },
  chip: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1, borderWidth: 1, borderRadius: radius.chip, paddingHorizontal: 6, paddingVertical: 1 },
  price: { fontFamily: fonts.sans, fontSize: 20, fontWeight: "600" },
  mono: { fontFamily: fonts.mono, fontSize: 11, letterSpacing: 0.4 },
  bullets: { gap: 4, marginTop: 2 },
  bullet: { fontFamily: fonts.sans, fontSize: 15, lineHeight: 21 },
  btn: { minHeight: 46, borderRadius: radius.control, alignItems: "center", justifyContent: "center", marginTop: 6, paddingHorizontal: 14 },
  btnText: { fontFamily: fonts.sans, fontSize: 16, fontWeight: "600" },
  dim: { opacity: 0.6 },
});
