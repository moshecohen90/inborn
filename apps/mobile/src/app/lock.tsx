import { useEffect } from "react";
import { useRouter } from "expo-router";
import { useAppServices } from "../services/AppServices";

/** inborn://lock and the "Lock now" action: raise the lock overlay (rendered by the root layout) and leave the stack. */
export default function LockRoute() {
  const { lock, prefs } = useAppServices();
  const router = useRouter();
  // Once per visit: the screen is replaced, so a re-render must not lock again after the user unlocked.
  useEffect(() => {
    if (prefs.lock.enabled) lock.lockNow();
    router.replace("/");
  }, []);
  return null;
}
