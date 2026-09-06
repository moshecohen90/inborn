import { Stack } from "expo-router";
import { useTheme } from "../../services/theme";

export default function OnboardingLayout() {
  const { theme } = useTheme();
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.bg } }} />;
}
