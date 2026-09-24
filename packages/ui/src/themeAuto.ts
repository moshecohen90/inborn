/**
 * "Auto" theme clock rule — same rule as the Tanach apps' display-mode service
 * (src/app/services/global/display-mode.service.ts): night is 18:00-06:00 local time,
 * OR whenever the OS already prefers a dark color scheme, whichever fires first.
 */
export function isAutoDark(now: Date, systemDark: boolean): boolean {
  const hour = now.getHours();
  return systemDark || hour >= 18 || hour < 6;
}
