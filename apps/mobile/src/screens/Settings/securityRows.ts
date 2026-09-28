/**
 * Which Security rows Settings shows. A browser cannot blur its tab in the app switcher or block screenshots, so those
 * rows are left out there rather than shown as switches that do nothing; the failed-unlock wipe needs a lock to count.
 */
export function securityRows(os: string, lockEnabled: boolean): { hideInSwitcher: boolean; screenshots: boolean; panicWipe: boolean } {
  const native = os !== "web";
  return { hideInSwitcher: native, screenshots: native, panicWipe: lockEnabled };
}
