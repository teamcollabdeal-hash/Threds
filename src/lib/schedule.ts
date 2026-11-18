import { zonedParts, zonedToUtc } from "./tz";

export interface RecurrenceRule {
  frequency: "daily" | "weekly" | "interval";
  times: string[];          // "HH:MM"
  weekdays: number[];       // 1..7
  interval_minutes?: number | null;
  timezone: string;
  starts_at: string;
  ends_at?: string | null;
}

/** Наступний запуск строго після `after`. null — розклад завершено. */
export function nextRun(rule: RecurrenceRule, after: Date): Date | null {
  const start = new Date(rule.starts_at);
  const end = rule.ends_at ? new Date(rule.ends_at) : null;
  const from = after < start ? new Date(start.getTime() - 1) : after;
  let result: Date | null = null;

  if (rule.frequency === "interval") {
    const step = Math.max(5, rule.interval_minutes ?? 60) * 60_000;
    const n = Math.floor((from.getTime() - start.getTime()) / step) + 1;
    result = new Date(start.getTime() + Math.max(0, n) * step);
  } else {
    const times = [...rule.times].map((t) => t.split(":").map(Number) as [number, number])
      .filter(([h, m]) => h >= 0 && h < 24 && m >= 0 && m < 60)
      .sort((a, b) => a[0] * 60 + a[1] - (b[0] * 60 + b[1]));
    if (!times.length) return null;
    const base = zonedParts(from, rule.timezone);
    for (let dayOffset = 0; dayOffset <= 14 && !result; dayOffset++) {
      const probe = new Date(Date.UTC(base.y, base.m - 1, base.d + dayOffset, 12));
      const y = probe.getUTCFullYear(), m = probe.getUTCMonth() + 1, d = probe.getUTCDate();
      const wd = ((probe.getUTCDay() + 6) % 7) + 1;
      if (rule.frequency === "weekly" && rule.weekdays.length && !rule.weekdays.includes(wd)) continue;
      for (const [hh, mm] of times) {
        const cand = zonedToUtc(y, m, d, hh, mm, rule.timezone);
        if (cand > from) { result = cand; break; }
      }
    }
  }
  if (!result || (end && result > end)) return null;
  return result;
}
