import { memo } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { directionOf, type ChatMessage } from "@inborn/core";
import { radius } from "@inborn/ui";
import { useTheme } from "../../lib/theme";
import { useType } from "../../services/type";

/** Quiet bubble (§9.6): surface-1, radius 14 with a 4 pt bottom corner, no tail, max 85 %, bidi by content. */
export const UserMessage = memo(function UserMessage({ message, onLongPress }: { message: ChatMessage; onLongPress: () => void }) {
  const type = useType();
  const theme = useTheme();
  const dir = directionOf(message.content);
  return (
    <Pressable testID="user-message" onLongPress={onLongPress} delayLongPress={350} accessibilityRole="text" style={[styles.bubble, { backgroundColor: theme.surface1 }]}>
      <Text style={[type.body, { color: theme.text, writingDirection: dir, textAlign: dir === "rtl" ? "right" : "left" }]} selectable>
        {message.content}
      </Text>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  bubble: { alignSelf: "flex-end", maxWidth: "85%", paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.card, borderBottomEndRadius: 4 },
});
