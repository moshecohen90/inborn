import { Platform } from "react-native";
import * as Haptics from "expo-haptics";

/** §9.5: rigid on seal close, warning on breach, never during streaming. Web has no haptics. */
export async function haptic(kind: "seal" | "warning" | "tap", enabled: boolean): Promise<void> {
  if (!enabled || Platform.OS === "web") return;
  try {
    if (kind === "seal") await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid);
    else if (kind === "warning") await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    else await Haptics.selectionAsync();
  } catch {
    /* no haptic engine */
  }
}
