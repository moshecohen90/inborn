import { memo } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { directionOf, type ChatMessage } from "@inborn/core";
import { radius } from "@inborn/ui";
import { useTheme } from "../../lib/theme";
import { useType } from "../../services/type";

/** Quiet bubble (§9.6): surface-1, radius 14 with a 4 pt bottom corner, no tail, max 85 %, bidi by content. */
export const UserMessage = memo(function UserMessage({ message, onLongPress }: { message: ChatMessage; onLongPress: () => void }) {
  const type = useType();
  const theme = useTheme();
  const { t } = useTranslation();
  const dir = directionOf(message.content);
  return (
    <Pressable testID="user-message" onLongPress={onLongPress} delayLongPress={350} accessibilityRole="text" style={[styles.bubble, { backgroundColor: theme.surface1 }]}>
      {message.images?.length ? (
        <View testID="user-images" style={styles.images}>
          {message.images.map((uri, i) => (
            <Image key={uri} source={{ uri }} accessibilityLabel={t("chat.image.label", { n: i + 1 })} style={[styles.image, { backgroundColor: theme.surface2 }]} resizeMode="cover" />
          ))}
        </View>
      ) : null}
      {message.content ? (
        <Text style={[type.body, { color: theme.text, writingDirection: dir, textAlign: dir === "rtl" ? "right" : "left" }]} selectable>
          {message.content}
        </Text>
      ) : null}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  bubble: { alignSelf: "flex-end", maxWidth: "85%", paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.card, borderBottomEndRadius: 4, gap: 8 },
  images: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  image: { width: 160, height: 120, borderRadius: 10 },
});
