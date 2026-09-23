import { router, useLocalSearchParams } from "expo-router";
import { PAYWALL_REASONS } from "@inborn/core";
import { PaywallScreen } from "../screens/paywall";
import { readReason } from "../licence";

/** S60 (spec §8.7): StoreKit 2 / Play Billing / licence keys through the licence store (src/licence). Presented as a modal. */
export default function PaywallRoute() {
  const { reason } = useLocalSearchParams<{ reason?: string }>();
  return <PaywallScreen modal reason={readReason(reason, PAYWALL_REASONS)} onClose={() => router.back()} onOpenDoc={(doc) => router.push(`/legal/${doc}`)} />;
}
