import { Image, Linking, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { useTranslation } from "react-i18next";
import { MIN_TOUCH } from "@inborn/ui";
import { STORE_LINKS } from "./links";

/** Apple's onscreen minimum; the Google Play badge is drawn at the same height, as its guidelines ask next to another store's. */
export const BADGE_HEIGHT = 40;

type Lang = "en" | "ja" | "de" | "fr" | "es" | "pt-BR" | "ko" | "zh-Hant";
const LANGS: readonly Lang[] = ["en", "ja", "de", "fr", "es", "pt-BR", "ko", "zh-Hant"];

/* Each localized Apple badge has its own width (viewBox at 40 high); Google's are one ratio, 238.96 x 70.87. */
const APPLE_WIDTH: Record<Lang, number> = { en: 119.66, ja: 108.85, de: 119.66, fr: 126.51, es: 119.66, "pt-BR": 119.66, ko: 129.7, "zh-Hant": 108.85 };
const PLAY_RATIO = 238.96 / 70.87;

const badgeLang = (lng: string): Lang => (LANGS as readonly string[]).includes(lng) ? (lng as Lang) : "en";

/**
 * F410: the App Store and Google Play badges, Apple's and Google's own artwork in the reader's language (public/badges),
 * never redrawn in our type. They link where the text buttons did until the listings are live (STORE_LINKS).
 */
export function StoreBadges({ testID, style }: { testID: string; style?: StyleProp<ViewStyle> }) {
  const { t, i18n } = useTranslation();
  const lang = badgeLang(i18n.language);
  const scale = BADGE_HEIGHT / 40;
  const badges = {
    appStore: { src: `/badges/app-store-${lang}.svg`, width: APPLE_WIDTH[lang] * scale },
    play: { src: `/badges/google-play-${lang}.svg`, width: BADGE_HEIGHT * PLAY_RATIO },
  } as const;
  return (
    <View testID={testID} style={[styles.row, style]}>
      {(["appStore", "play"] as const).map((where) => (
        <Pressable
          key={where}
          testID={`${testID}-${where}`}
          accessibilityRole="link"
          accessibilityLabel={t(`web.badge.${where}`)}
          onPress={() => void Linking.openURL(STORE_LINKS[where])}
          style={({ pressed }) => [styles.target, { opacity: pressed ? 0.85 : 1 }]}
        >
          <Image source={{ uri: badges[where].src }} style={{ width: badges[where].width, height: BADGE_HEIGHT }} resizeMode="contain" accessibilityIgnoresInvertColors />
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  /* A quarter of the badge height is the clear space both guidelines ask for. */
  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: BADGE_HEIGHT / 4, rowGap: 4 },
  target: { minHeight: MIN_TOUCH, justifyContent: "center" },
});
