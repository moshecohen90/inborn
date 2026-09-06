import { router } from "expo-router";
import { PaywallScreen } from "../screens/paywall";

/** S60 (spec §8.7): StoreKit 2 / Play Billing / licence keys through the licence store (src/licence). Presented as a modal. */
export default function PaywallRoute() {
  return <PaywallScreen onClose={() => router.back()} onOpenDoc={() => router.push("/settings/about")} />;
}
