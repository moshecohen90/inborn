import { useEffect, useRef, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { BannerSpacer } from "../../components/shell/bannerInset";
import { useTheme } from "../../services/theme";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon, MIN_TOUCH, radius } from "@inborn/ui";
import { sellable, type PaywallReason, type ProductId, type Store } from "@inborn/core";
import { DEV_AUTOBUY, DEV_RESULT_FILE, devBuild } from "../../licence/devFlags";
import { useLicenceState } from "../../licence/hooks";
import { writeLicenceResult } from "../../licence/storage";
import { LicenceKeySheet } from "./LicenceKeySheet";
import { TierCard } from "./TierCard";
import { CompareTable } from "./CompareTable";
import { WebStoreBlock } from "./WebStoreBlock";
import { useType } from "../../services/type";

export interface PaywallScreenProps {
  onClose: () => void;
  /** Which locked tap opened this, so the first line answers that tap instead of pitching (§12.3). */
  reason?: PaywallReason | null;
  /** Opens the in-app legal documents (docs/legal); the host decides how they are shown. */
  onOpenDoc?: (doc: "terms" | "privacy") => void;
  /** Overrides the platform default (Pro first on phones, Work first on desktop / web). */
  workFirst?: boolean;
  /** Presented as a sheet over another screen: iOS already keeps it clear of the status bar. */
  modal?: boolean;
}

const storeName = (t: (k: string) => string, store: Store | null): string => (store === "app-store" ? t("paywall.store.appStore") : store === "play" ? t("paywall.store.play") : store === "microsoft-store" ? t("paywall.store.microsoft") : t("paywall.store.licenceKey"));

/** S60 Pro paywall (spec §8.7, §12): one line on why paying once is honest, one card per tier, Restore, Family Sharing note, the one-store rule. */
export function PaywallScreen({ onClose, reason, onOpenDoc, workFirst, modal }: PaywallScreenProps) {
  const type = useType();
  const { t, i18n } = useTranslation();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { manager, state } = useLicenceState();
  const [keySheet, setKeySheet] = useState(false);
  const desktopFirst = workFirst ?? Platform.OS === "web";
  const autobuyDone = useRef(false);

  useEffect(() => () => manager?.acknowledgePurchaseUi(), [manager]);

  /* Headless simulator proof: buy the named product once the store answered, then record the outcome (dev bundles only). */
  useEffect(() => {
    if (!devBuild() || !DEV_AUTOBUY || !manager || !state || state.phase !== "ready" || autobuyDone.current) return;
    autobuyDone.current = true;
    const product: string = DEV_AUTOBUY;
    writeLicenceResult(DEV_RESULT_FILE, { step: "before", tier: state.entitlement.tier, storeReachable: state.storeReachable, fromCache: state.entitlement.fromCache, prices: state.prices });
    if (product === "restore") void manager.restore();
    else if (product === "none") return;
    else if (state.entitlement.tier === "free" || manager.offers().some((o) => o.productId === product)) setTimeout(() => void manager.buy(product as ProductId), 1500);
  }, [manager, state]);
  useEffect(() => {
    if (!devBuild() || !DEV_AUTOBUY || !state || state.phase !== "ready") return;
    if (state.purchase.kind === "done" || state.purchase.kind === "failed" || state.restore.kind === "done" || state.restore.kind === "failed") {
      writeLicenceResult(DEV_RESULT_FILE, { step: "after", tier: state.entitlement.tier, purchase: state.purchase, restore: state.restore, storeReachable: state.storeReachable, fromCache: state.entitlement.fromCache, graceEndsAt: state.entitlement.graceEndsAt, rejected: state.rejected, transactionId: state.entitlement.purchase?.transactionId, environment: state.entitlement.purchase?.environment });
    }
  }, [state]);

  if (!manager || !state) {
    return <View style={[styles.root, { backgroundColor: theme.bg }]} />;
  }

  const store = manager.store;
  const tier = state.entitlement.tier;
  const offers = manager.offers().filter((o) => sellable(o.tier));
  const ordered = desktopFirst ? [...offers].sort((a, b) => (a.tier === "work" ? -1 : b.tier === "work" ? 1 : 0)) : offers;
  const busyProduct = state.purchase.kind === "purchasing" ? state.purchase.productId : null;
  const owned = tier !== "free";
  const purchase = state.entitlement.purchase;
  const when = (ms: number) => new Intl.DateTimeFormat(i18n.language, { month: "short", day: "numeric" }).format(new Date(ms));

  const status = (): { text: string; tone: "info" | "danger" | "ok" } | null => {
    if (state.purchase.kind === "pending") return { text: t("paywall.pending"), tone: "info" };
    if (state.purchase.kind === "failed") return { text: t("paywall.failed", { code: state.purchase.code }), tone: "danger" };
    if (state.purchase.kind === "done") return { text: t(tier === "work" ? "paywall.owned.work" : "paywall.owned.pro"), tone: "ok" };
    if (state.restore.kind === "running") return { text: t("paywall.restoring"), tone: "info" };
    if (state.restore.kind === "done") return { text: t("paywall.restored", { count: state.restore.found }), tone: state.restore.found ? "ok" : "info" };
    if (state.restore.kind === "failed") return { text: t("paywall.restoreFailed"), tone: "danger" };
    if (state.code.kind === "failed") return { text: t("paywall.code.failed"), tone: "danger" };
    if (state.storeReachable === false && store) {
      if (state.entitlement.fromCache && state.entitlement.graceEndsAt && tier === "free") return { text: t("paywall.graceExpired"), tone: "danger" };
      return { text: t("paywall.offline"), tone: "info" };
    }
    return null;
  };
  const line = status();

  return (
    <View style={[styles.root, { backgroundColor: theme.bg, paddingTop: modal && Platform.OS === "ios" ? 12 : insets.top + 8 }]}>
      <View style={styles.header}>
        <Pressable testID="close-paywall" accessibilityRole="button" accessibilityLabel={t("paywall.close")} onPress={onClose} hitSlop={8} style={styles.headerBtn}>
          <Icon name="x" size={20} color={theme.text2} />
        </Pressable>
        <View style={styles.headerBtn} />
      </View>
      <BannerSpacer />
      <ScrollView contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }]}>
        <Text testID="paywall-title" style={[type.display, { color: theme.text }]}>
          {t("paywall.title")}
        </Text>
        <Text style={[type.body, { color: theme.text2 }]}>{t("paywall.sub")}</Text>
        {reason ? (
          <Text testID="paywall-why" style={[type.body, styles.why, { color: theme.accent, borderColor: theme.accent }]}>
            {t(`paywall.why.${reason}`)}
          </Text>
        ) : null}

        {owned ? (
          <View testID="owned" style={[styles.owned, { borderColor: theme.sealed, backgroundColor: theme.surface1 }]}>
            <Text style={[type.monoLabel, { color: theme.sealed }]}>{t(tier === "work" ? "paywall.owned.work" : "paywall.owned.pro")}</Text>
            <Text style={[type.bodySmall, { color: theme.text2 }]}>{t("paywall.owned.sub", { store: storeName(t, store) })}</Text>
            {purchase?.familyShared ? <Text style={[type.mono, styles.mono, { color: theme.text3 }]}>{t("paywall.familyShared")}</Text> : null}
            {state.entitlement.fromCache && state.entitlement.graceEndsAt ? <Text style={[type.mono, styles.mono, { color: theme.text3 }]}>{t("paywall.grace", { when: when(state.entitlement.graceEndsAt) })}</Text> : null}
          </View>
        ) : null}

        {line ? (
          <Text testID="paywall-status" style={[type.bodySmall, { color: line.tone === "danger" ? theme.danger : line.tone === "ok" ? theme.sealed : theme.text2 }]}>
            {line.text}
          </Text>
        ) : null}

        {store === null ? (
          <WebStoreBlock theme={theme} />
        ) : (
          <View style={styles.cards}>
            {ordered.map((offer, i) => (
              <TierCard key={offer.productId} offer={offer} price={manager.priceOf(offer.productId)} theme={theme} primary={i === 0} busy={busyProduct === offer.productId} disabled={busyProduct !== null || state.purchase.kind === "pending" || store === "licence-key"} onBuy={() => void manager.buy(offer.productId)} />
            ))}
          </View>
        )}

        {store ? (
          <View style={styles.links}>
            {store === "licence-key" ? (
              <Pressable testID="enter-key" accessibilityRole="button" onPress={() => setKeySheet(true)} hitSlop={8}>
                <Text style={[type.bodySmall, type.strong, styles.link, { color: theme.text }]}>{t("paywall.key.title")}</Text>
              </Pressable>
            ) : (
              <Pressable testID="restore" accessibilityRole="button" disabled={state.restore.kind === "running"} onPress={() => void manager.restore()} hitSlop={8}>
                <Text style={[type.bodySmall, type.strong, styles.link, { color: theme.text }]}>{t("paywall.restore")}</Text>
              </Pressable>
            )}
            {manager.canRedeemStoreCode() ? (
              <Pressable testID="redeem-code" accessibilityRole="button" disabled={state.code.kind === "opening"} onPress={() => void manager.redeemStoreCode()} hitSlop={8}>
                <Text style={[type.bodySmall, type.strong, styles.link, { color: theme.text }]}>{t("paywall.code.title")}</Text>
              </Pressable>
            ) : null}
            {Platform.OS === "ios" ? <Text style={[type.mono, styles.mono, { color: theme.text3 }]}>{state.familyShareable ? t("paywall.familySharing.ios") : t("paywall.familySharing.iosOff")}</Text> : null}
            {Platform.OS === "android" ? <Text style={[type.mono, styles.mono, { color: theme.text3 }]}>{t("paywall.familySharing.play")}</Text> : null}
          </View>
        ) : null}

        <CompareTable theme={theme} owned={owned ? tier : undefined} />

        <Text style={[type.bodySmall, styles.footer, { color: theme.text2 }]}>{t("paywall.footer")}</Text>
        {store ? <Text style={[type.bodySmall, styles.footer, { color: theme.text3 }]}>{t("paywall.oneStore", { store: storeName(t, store) })}</Text> : null}
        {store === "play" ? <Text style={[type.bodySmall, styles.footer, { color: theme.text3 }]}>{t("paywall.play.acknowledge")}</Text> : null}
        <View style={styles.legal}>
          <Pressable accessibilityRole="link" onPress={() => onOpenDoc?.("terms")} style={styles.legalLink}>
            <Text style={[type.mono, styles.mono, { color: theme.text2 }]}>{t("paywall.terms")}</Text>
          </Pressable>
          <Text style={[type.mono, styles.mono, { color: theme.text3 }]}>·</Text>
          <Pressable accessibilityRole="link" onPress={() => onOpenDoc?.("privacy")} style={styles.legalLink}>
            <Text style={[type.mono, styles.mono, { color: theme.text2 }]}>{t("paywall.privacy")}</Text>
          </Pressable>
        </View>
        {devBuild() && state.rejected.length ? <Text style={[type.mono, styles.mono, styles.centered, { color: theme.text3 }]}>{`refused: ${state.rejected.join(", ")}`}</Text> : null}
      </ScrollView>
      {keySheet ? <LicenceKeySheet manager={manager} theme={theme} onClose={() => setKeySheet(false)} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12 },
  headerBtn: { width: MIN_TOUCH, height: MIN_TOUCH, alignItems: "center", justifyContent: "center" },
  list: { paddingHorizontal: 20, gap: 14, maxWidth: 560, width: "100%", alignSelf: "center" },
  cards: { gap: 12 },
  owned: { borderWidth: 1, borderRadius: radius.card, padding: 14, gap: 4 },
  why: { borderLeftWidth: 2, paddingLeft: 10 },
  links: { alignItems: "center", gap: 6, marginTop: 4 },
  link: { textDecorationLine: "underline" },
  mono: { textAlign: "center" },
  footer: { textAlign: "center" },
  legal: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 10 },
  legalLink: { minHeight: MIN_TOUCH, justifyContent: "center", paddingHorizontal: 4 },
  centered: { textAlign: "center" },
});
