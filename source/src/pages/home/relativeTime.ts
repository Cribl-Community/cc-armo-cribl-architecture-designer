const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
];

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

/** "5 minutes ago", "yesterday", "just now". */
export function relativeTime(iso: string, now = Date.now()): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return 'Unknown';
  const diffSec = (t - now) / 1000;
  if (Math.abs(diffSec) < 45) return 'Just now';
  for (const [unit, secs] of UNITS) {
    if (Math.abs(diffSec) >= secs || unit === 'minute') {
      const text = rtf.format(Math.round(diffSec / secs), unit);
      return text.charAt(0).toUpperCase() + text.slice(1);
    }
  }
  return 'Just now';
}

export const absoluteTime = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
};
