const DAY_MS = 86_400_000;

/** Time for a chats-list row: clock time today, weekday within the week, otherwise month + day. */
export function formatWhen(ts: number, locale: string, now = Date.now()): string {
  const d = new Date(ts);
  try {
    if (d.toDateString() === new Date(now).toDateString()) return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(d);
    if (now - ts < 6 * DAY_MS) return new Intl.DateTimeFormat(locale, { weekday: "short" }).format(d);
    return new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" }).format(d);
  } catch {
    return d.toLocaleDateString();
  }
}
