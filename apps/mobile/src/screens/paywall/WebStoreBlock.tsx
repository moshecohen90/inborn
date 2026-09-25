import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Icon, radius, type Theme } from "@inborn/ui";
import { PAYWALL_BULLETS, fallbackPrice, offersFor, sellable } from "@inborn/core";
import { STORE_LINKS } from "../../web/links";
import { useType } from "../../services/type";

/**
 * What a browser reader gets instead of a Buy button (spec §4.4): the same tiers with their US list prices and the way
 * to the app that sells them. Without it the page said only "Pro is sold in the apps" and named no price at all.
 */
export function WebStoreBlock({ theme }: { theme: Theme }) {
  const { t } = useTranslation();
  const type = useType();
  const offers = offersFor("free", Date.now(), null).filter((o) => sellable(o.tier));
  return (
    <View testID="web-store-block" style={styles.root}>
      <Text testID="web-paywall-title" style={[type.title, { color: theme.text }]}>
        {t("paywall.web.title")}
      </Text>
      <Text style={[type.body, { color: theme.text2 }]}>{t("paywall.web.sub")}</Text>
      <View style={styles.prices}>
        {offers.map((offer) => (
          <View key={offer.productId} testID={`web-price-${offer.tier}`} style={[styles.card, { borderColor: theme.border, backgroundColor: theme.surface1 }]}>
            <Text style={[type.monoLabel, styles.tier, { color: theme.text }]}>{t(offer.tier === "work" ? "paywall.work.name" : "paywall.pro.name")}</Text>
            <Text style={[type.title, { color: theme.text }]}>{t("paywall.priceLine", { price: fallbackPrice(offer.productId).display })}</Text>
            {/* The same five lines read as a list on the phone and as prose in the browser until the mark came here too (QA F253). */}
            {PAYWALL_BULLETS[offer.tier].map((b) => (
              <View key={b} style={styles.bulletRow}>
                <Icon name="check" size={14} color={theme.text2} style={styles.bulletIcon} />
                <Text style={[type.bodySmall, styles.bulletText, { color: theme.text2 }]}>{t(`paywall.${offer.tier}.${b}`)}</Text>
              </View>
            ))}
          </View>
        ))}
      </View>
      <Text testID="web-price-note" style={[type.mono, { color: theme.text3 }]}>
        {t("paywall.web.priceNote")}
      </Text>
      <View style={styles.buttons}>
        {/* Windows and macOS have no listing yet, and the site's Get section says so; a Desktop button here contradicted it. */}
        {(["appStore", "play"] as const).map((where) => (
          <Pressable
            key={where}
            testID={`web-get-${where}`}
            accessibilityRole="link"
            onPress={() => void Linking.openURL(STORE_LINKS[where])}
            style={({ pressed }) => [styles.btn, { borderColor: theme.text2, opacity: pressed ? 0.85 : 1 }]}
          >
            <Text style={[type.body, type.strong, { color: theme.text }]}>{t(`paywall.web.${where}`)}</Text>
          </Pressable>
        ))}
      </View>
      {/* The browser keeps its PRO and WORK marks (spec §4.4: no Pro on the web), so this line says what they are (F386). */}
      <Text testID="web-locks" style={[type.bodySmall, { color: theme.text2 }]}>
        {t("paywall.web.locks")}
      </Text>
      <Text testID="web-stays-free" style={[type.bodySmall, { color: theme.text3 }]}>{t("paywall.noStore")}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 12 },
  prices: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  card: { flexGrow: 1, flexBasis: 220, borderWidth: 1, borderRadius: radius.card, padding: 16, gap: 6 },
  tier: { letterSpacing: 1.5 },
  bulletRow: { flexDirection: "row", gap: 8 },
  bulletIcon: { marginTop: 3 },
  bulletText: { flex: 1 },
  buttons: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  btn: { minHeight: 46, flexGrow: 1, flexBasis: 140, borderWidth: 1, borderRadius: radius.control, alignItems: "center", justifyContent: "center", paddingHorizontal: 14 },
});
