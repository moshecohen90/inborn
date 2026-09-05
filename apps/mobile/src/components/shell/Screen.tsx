import type { ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { useTheme, FONT } from "../../services/theme";
import { Mesh, MonoLabel } from "./primitives";
import { Seal, type SealState } from "../Seal";

interface HeaderProps {
  title?: string;
  /** Show the 28 px seal + label in the centre instead of a title. */
  seal?: { state: SealState; label: string };
  back?: boolean | string;
  end?: ReactNode;
  onBack?: () => void;
}

/** Header (§8: seal centred, start action, end chip). Custom on purpose: identical on iOS, Android and web. */
export function Header({ title, seal, back = true, end, onBack }: HeaderProps) {
  const { theme } = useTheme();
  const router = useRouter();
  const goBack = onBack ?? (() => (router.canGoBack() ? router.back() : router.replace("/")));
  return (
    <View style={styles.header}>
      <View style={styles.headerSide}>
        {back ? (
          <Pressable testID="back" accessibilityRole="button" accessibilityLabel={typeof back === "string" ? back : "Back"} onPress={goBack} hitSlop={8} style={styles.headerBtn}>
            <Text style={[styles.backGlyph, { color: theme.text2 }]}>‹</Text>
            {typeof back === "string" ? <Text style={[styles.backText, { color: theme.text2 }]}>{back}</Text> : null}
          </Pressable>
        ) : null}
      </View>
      <View style={styles.headerCenter}>
        {seal ? (
          <View style={styles.sealRow}>
            <Seal size={28} state={seal.state} label={seal.label} />
            <MonoLabel color={seal.state === "unsealed" ? theme.danger : seal.state === "lan" ? theme.accent : theme.sealed}>{seal.label}</MonoLabel>
          </View>
        ) : title ? (
          <Text numberOfLines={1} style={[styles.title, { color: theme.text }]}>
            {title}
          </Text>
        ) : null}
      </View>
      <View style={[styles.headerSide, styles.headerEnd]}>{end}</View>
    </View>
  );
}

interface ScreenProps {
  children: ReactNode;
  header?: HeaderProps | null;
  scroll?: boolean;
  mesh?: boolean;
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  footer?: ReactNode;
}

export function Screen({ children, header, scroll = true, mesh = false, padded = true, style, testID, footer }: ScreenProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const content = <View style={[padded ? styles.padded : null, style]}>{children}</View>;
  return (
    <View testID={testID} style={[styles.root, { backgroundColor: theme.bg, paddingTop: insets.top }]}>
      {mesh ? <Mesh /> : null}
      {header ? <Header {...header} /> : null}
      {scroll ? (
        <ScrollView style={styles.flex} contentContainerStyle={{ paddingBottom: insets.bottom + 24 }} keyboardShouldPersistTaps="handled">
          {content}
        </ScrollView>
      ) : (
        <View style={styles.flex}>{content}</View>
      )}
      {footer ? <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>{footer}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  padded: { paddingHorizontal: 16, gap: 12 },
  header: { flexDirection: "row", alignItems: "center", height: 44, paddingHorizontal: 8 },
  headerSide: { width: 96, flexDirection: "row", alignItems: "center" },
  headerEnd: { justifyContent: "flex-end" },
  headerCenter: { flex: 1, alignItems: "center", justifyContent: "center" },
  headerBtn: { minWidth: 44, height: 44, flexDirection: "row", alignItems: "center", paddingHorizontal: 4 },
  backGlyph: { fontSize: 28, lineHeight: 30, marginTop: -2 },
  backText: { fontFamily: FONT.sans, fontSize: 16, marginLeft: 2 },
  title: { fontFamily: FONT.sans, fontSize: 17, fontWeight: "600" },
  sealRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  footer: { paddingHorizontal: 16, paddingTop: 12, gap: 8 },
});
