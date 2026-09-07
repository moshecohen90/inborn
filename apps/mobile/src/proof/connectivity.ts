import { useEffect, useState } from "react";
import { Linking, Platform } from "react-native";
import * as Network from "expo-network";

export interface Connectivity {
  /** True when no path exists at all (airplane mode or every radio off). */
  offline: boolean;
  type: string;
  known: boolean;
}

/** NWPathMonitor / ConnectivityManager through expo-network (S03). Polls because the state listener is not on every platform. */
export function useConnectivity(intervalMs = 1500): Connectivity {
  const [c, setC] = useState<Connectivity>({ offline: false, type: "unknown", known: false });
  useEffect(() => {
    let alive = true;
    const read = async () => {
      try {
        const s = await Network.getNetworkStateAsync();
        // Android keeps Wi-Fi up under Airplane Mode when it was on before, so connectivity alone reads "OFF" (OnePlus 11, 7.9.2026).
        const airplane = Platform.OS === "android" ? await Network.isAirplaneModeEnabledAsync().catch(() => false) : false;
        if (!alive) return;
        const type = String(s.type ?? "UNKNOWN");
        setC({ offline: airplane || s.isConnected === false || type === "NONE", type, known: s.isConnected !== undefined });
      } catch {
        if (alive) setC({ offline: false, type: "unknown", known: false });
      }
    };
    void read();
    const id = setInterval(read, intervalMs);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [intervalMs]);
  return c;
}

/** Android opens the airplane-mode settings; iOS has no such intent (Control Center by hand); web nothing. */
export async function openAirplaneSettings(): Promise<boolean> {
  try {
    if (Platform.OS === "android") {
      await Linking.sendIntent("android.settings.AIRPLANE_MODE_SETTINGS");
      return true;
    }
  } catch {
    /* fall through */
  }
  return false;
}
