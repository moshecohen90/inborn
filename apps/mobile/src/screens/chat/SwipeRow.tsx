import { useRef, type ReactNode } from "react";
import { Animated, PanResponder, Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../../lib/theme";
import { type } from "../../components/chat/styles";

export interface SwipeAction {
  key: string;
  label: string;
  color: string;
  onPress: () => void;
  testID?: string;
}

const ACTION_WIDTH = 72;

/** Swipe left to reveal row actions (§8.3 S20: pin / archive / delete). Pure RN: no gesture library, no native module. */
export function SwipeRow({ children, actions, enabled = true }: { children: ReactNode; actions: SwipeAction[]; enabled?: boolean }) {
  const theme = useTheme();
  const x = useRef(new Animated.Value(0)).current;
  const open = useRef(false);
  const width = ACTION_WIDTH * actions.length;
  const settle = (to: number) => {
    open.current = to !== 0;
    Animated.timing(x, { toValue: to, duration: 180, useNativeDriver: true }).start();
  };
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => enabled && Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderMove: (_, g) => {
        const base = open.current ? -width : 0;
        x.setValue(Math.max(-width, Math.min(0, base + g.dx)));
      },
      onPanResponderRelease: (_, g) => {
        const base = open.current ? -width : 0;
        settle(base + g.dx < -width / 2 ? -width : 0);
      },
      onPanResponderTerminate: () => settle(open.current ? -width : 0),
    }),
  ).current;
  return (
    <View style={styles.wrap}>
      <View style={[styles.actions, { width }]}>
        {actions.map((a) => (
          <Pressable
            key={a.key}
            testID={a.testID}
            accessibilityRole="button"
            onPress={() => {
              settle(0);
              a.onPress();
            }}
            style={[styles.action, { backgroundColor: a.color }]}
          >
            <Text allowFontScaling={false} style={[type.caption, { color: theme.bg }]} numberOfLines={1}>
              {a.label}
            </Text>
          </Pressable>
        ))}
      </View>
      <Animated.View style={[styles.front, { backgroundColor: theme.bg, transform: [{ translateX: x }] }]} {...pan.panHandlers}>
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { overflow: "hidden" },
  actions: { position: "absolute", right: 0, top: 0, bottom: 0, flexDirection: "row" },
  action: { width: ACTION_WIDTH, alignItems: "center", justifyContent: "center" },
  front: { width: "100%" },
});
