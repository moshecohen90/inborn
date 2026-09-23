import type { ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Icon } from "@inborn/ui";

import { useTheme } from "../../services/theme";
import { useKeyboardLift } from "../../lib/keyboard";
import { useActionMaxWidth, useCardMaxWidth, useContentMaxWidth } from "../../lib/useLayout";
import { useType } from "../../services/type";
import { Mesh, MonoLabel } from "./primitives";
import { ChromeBar, liquidGlass } from "./NativeChrome";
import { Seal, type SealState } from "../Seal";
import { useBannerPad } from "./bannerInset";

interface HeaderProps {
  title?: string;
  /** Show the 28 px seal + label in the centre instead of a title. */
  seal?: { state: SealState; label: string };
  back?: boolean | string;
  end?: ReactNode;
  onBack?: () => void;
}

export const HEADER_HEIGHT = 44;

/** Header (§8: seal centred, start action, end chip) inside the platform's navigation chrome (§9.7). */
export function Header({ title, seal, back = true, end, onBack }: HeaderProps) {
  const { theme } = useTheme();
  const type = useType();
  const router = useRouter();
  const goBack = onBack ?? (() => (router.canGoBack() ? router.back() : router.replace("/")));
  return (
    <View style={styles.header}>
      <View style={styles.headerSide}>
        {back ? (
          <Pressable testID="back" accessibilityRole="button" accessibilityLabel={typeof back === "string" ? back : "Back"} onPress={goBack} hitSlop={8} style={styles.headerBtn}>
            <Icon name="chevronLeft" size={24} color={theme.text2} />
            {typeof back === "string" ? <Text style={[type.body, { color: theme.text2 }]}>{back}</Text> : null}
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
          <Text numberOfLines={1} style={[type.heading, { color: theme.text }]}>
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
  /** Onboarding (§8.9): one centred card holding body and footer once the window is wide; the phone layout is unchanged. */
  card?: boolean;
  /** Opt out of the reading column, for screens that own their own width (lists, panels). */
  bleed?: boolean;
}

export function Screen({ children, header, scroll = true, mesh = false, padded = true, style, testID, footer, card = false, bleed = false }: ScreenProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const lift = useKeyboardLift();
  const bannerInset = useBannerPad(header ? HEADER_HEIGHT : 0);
  const contentMax = useContentMaxWidth();
  const actionMax = useActionMaxWidth();
  const cardMax = useCardMaxWidth();
  const onCard = card && cardMax !== undefined;
  const columnMax = onCard ? cardMax : bleed ? undefined : contentMax;
  const body = <View style={[padded ? styles.padded : null, style]}>{children}</View>;
  const actions = footer ? <View style={[styles.actionColumn, onCard ? null : { maxWidth: actionMax }]}>{footer}</View> : null;
  /* Glass only reads as glass with content moving under it: the bar floats over the scroll view, which pads itself by the bar's height. */
  const overlay = liquidGlass && !!header && scroll;
  const barHeight = insets.top + HEADER_HEIGHT;
  const content = (
    <View style={[styles.column, { maxWidth: columnMax }, onCard ? [styles.card, { borderColor: theme.border, backgroundColor: theme.surface1 }] : null]}>
      {body}
      {onCard && actions ? <View style={styles.cardFooter}>{actions}</View> : null}
    </View>
  );
  return (
    <View testID={testID} style={[styles.root, { backgroundColor: theme.bg, paddingTop: overlay ? 0 : insets.top, paddingBottom: lift }]}>
      {mesh ? <Mesh /> : null}
      {header && !overlay ? <Header {...header} /> : null}
      {scroll ? (
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[onCard ? styles.centred : null, { paddingTop: (overlay ? barHeight : 0) + bannerInset, paddingBottom: (lift ? 0 : insets.bottom) + 24 }]}
          keyboardShouldPersistTaps="handled"
        >
          {content}
        </ScrollView>
      ) : (
        <View style={[styles.flex, onCard ? styles.centred : null, { paddingTop: bannerInset }]}>{content}</View>
      )}
      {header && overlay ? (
        <ChromeBar style={[styles.overlay, { paddingTop: insets.top }]}>
          <Header {...header} />
        </ChromeBar>
      ) : null}
      {!onCard && actions ? <View style={[styles.footer, { paddingBottom: (lift ? 0 : insets.bottom) + 12 }]}>{actions}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  column: { width: "100%", alignSelf: "center" },
  actionColumn: { width: "100%", alignSelf: "center", gap: 8 },
  centred: { flexGrow: 1, justifyContent: "center", paddingHorizontal: 16 },
  card: { borderWidth: 1, borderRadius: 20, paddingVertical: 28 },
  cardFooter: { paddingHorizontal: 16, paddingTop: 20, gap: 8 },
  padded: { paddingHorizontal: 16, gap: 12 },
  overlay: { position: "absolute", top: 0, left: 0, right: 0 },
  header: { flexDirection: "row", alignItems: "center", height: HEADER_HEIGHT, paddingHorizontal: 8 },
  headerSide: { width: 96, flexDirection: "row", alignItems: "center" },
  headerEnd: { justifyContent: "flex-end" },
  headerCenter: { flex: 1, alignItems: "center", justifyContent: "center" },
  headerBtn: { minWidth: 44, height: 44, flexDirection: "row", alignItems: "center", paddingHorizontal: 4 },
  sealRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  footer: { paddingHorizontal: 16, paddingTop: 12, gap: 8 },
});
