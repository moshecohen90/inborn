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
        if (!alive) return;
        const type = String(s.type ?? "UNKNOWN");
        setC({ offline: s.isConnected === false || type === "NONE", type, known: s.isConnected !== undefined });
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
