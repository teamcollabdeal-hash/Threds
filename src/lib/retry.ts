import type { ErrorKind } from "./threads/errors";

export type RetryDecision =
  | { action: "retry"; at: Date }
  | { action: "fail" }
  | { action: "pause_account" };

/** Політика повторів: експоненційна затримка для тимчасових збоїв, довша — для лімітів, стоп — для авторизації. */
export function decideRetry(kind: ErrorKind, attempts: number, maxAttempts: number, now = new Date()): RetryDecision {
  if (kind === "auth") return { action: "pause_account" };
  if (kind === "content") return { action: "fail" };
  if (attempts >= maxAttempts) return { action: "fail" };
  const minutes = kind === "rate_limit"
    ? Math.min(60 * 6, 15 * 2 ** (attempts - 1))      // 15, 30, 60, 120 … ≤6 год
    : Math.min(60, 2 ** (attempts - 1));              // 1, 2, 4, 8, 16 … ≤60 хв
  return { action: "retry", at: new Date(now.getTime() + minutes * 60_000) };
}

/** Чи можна публікувати зараз з урахуванням денного ліміту і мінімального інтервалу акаунта. */
export function quotaGate(opts: {
  publishedLast24h: Date[]; dailyLimit: number; minIntervalMinutes: number; now?: Date;
}): { ok: true } | { ok: false; retryAt: Date; reason: string } {
  const now = opts.now ?? new Date();
  const sorted = [...opts.publishedLast24h].sort((a, b) => a.getTime() - b.getTime());
  const limit = Math.min(opts.dailyLimit, 250);
  if (sorted.length >= limit) {
    const oldest = sorted[sorted.length - limit];
    return { ok: false, retryAt: new Date(oldest.getTime() + 24 * 3600_000 + 60_000), reason: `Денний ліміт ${limit} вичерпано` };
  }
  const last = sorted[sorted.length - 1];
  if (last && opts.minIntervalMinutes > 0) {
    const earliest = new Date(last.getTime() + opts.minIntervalMinutes * 60_000);
    if (earliest > now) return { ok: false, retryAt: earliest, reason: `Мінімальний інтервал ${opts.minIntervalMinutes} хв` };
  }
  return { ok: true };
}
