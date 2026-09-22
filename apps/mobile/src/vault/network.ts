import * as Network from "expo-network";
import type { NetworkKind } from "@inborn/core";

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
  try {
    const s = await Network.getNetworkStateAsync();
    return kindOf(s.type as string | undefined, s.isConnected);
  } catch {
    return "unknown";
  }
}
