import { Platform } from "react-native";

/** F387: a computer or a browser tab has no Airplane Mode to turn on, so the web build (desktop included) says "go offline". */
export const offlineKey = (key: string): string => (Platform.OS === "web" ? `${key}Offline` : key);
