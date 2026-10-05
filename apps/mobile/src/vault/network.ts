import * as Network from "expo-network";
import type { NetworkKind } from "@inborn/core";
import { onSimulatedOffline, simulatedOffline } from "./devOffline";

/** expo-network's NetworkStateType strings, in the shape `shouldWait` decides on (§10.1 #4). */
export function kindOf(type: string | undefined, isConnected: boolean | undefined): NetworkKind {
  if (isConnected === false) return "none";
  switch (String(type ?? "").toUpperCase()) {
    case "WIFI":
      return "wifi";
    case "ETHERNET":
      return "ethernet";
    case "CELLULAR":
      return "cellular";
    case "NONE":
      return "none";
    default:
      /* VPN, Bluetooth tethering, WiMAX and an unreported type all bill like a phone plan until proven otherwise. */
      return "unknown";
  }
}

/** The path the next byte would take (ConnectivityManager / NWPathMonitor); "unknown" when the platform will not say. */
export async function networkKind(): Promise<NetworkKind> {
  if (simulatedOffline()) return "none";
  try {
    const s = await Network.getNetworkStateAsync();
    return kindOf(s.type as string | undefined, s.isConnected);
  } catch {
    return "unknown";
  }
}

/** Each change of path, so a download parked on "no connection" moves the moment the path is back, not on the next poll. */
export function onNetworkChange(listener: (kind: NetworkKind) => void): () => void {
  const stops = [onSimulatedOffline(() => void networkKind().then(listener))];
  try {
    const sub = Network.addNetworkStateListener((s) => listener(simulatedOffline() ? "none" : kindOf(s.type as string | undefined, s.isConnected)));
    stops.push(() => sub.remove());
  } catch {
    /* no listener on this platform: the poll still runs */
  }
  return () => stops.forEach((stop) => stop());
}
