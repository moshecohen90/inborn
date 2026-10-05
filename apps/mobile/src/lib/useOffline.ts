import { useEffect, useState } from "react";
import { networkKind, onNetworkChange } from "../vault/network";

/** True while this device has no path at all, so a download door can say so before the tap. */
export function useOffline(): boolean {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    let live = true;
    void networkKind().then((k) => live && setOffline(k === "none"));
    const stop = onNetworkChange((k) => setOffline(k === "none"));
    return () => {
      live = false;
      stop();
    };
  }, []);
  return offline;
}
