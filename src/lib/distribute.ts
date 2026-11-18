/**
 * Розподіл контенту між акаунтами для Bulk Publishing.
 *  - "row"         — кожен рядок іде на акаунти, вказані в рядку (або на всі вибрані, якщо не вказано)
 *  - "round_robin" — рядки по черзі розподіляються між вибраними акаунтами (1 рядок → 1 акаунт)
 *  - "all"         — кожен рядок публікується на всіх вибраних акаунтах
 * Час: якщо в рядку немає дати — береться start + i*spacing для кожного акаунта окремо.
 */
export interface BulkRow { text: string; media: string[]; accounts: string[]; scheduled_at?: string | null; campaign?: string | null }
export interface PlannedPublication { rowIndex: number; accountId: string; scheduledAt: Date }

export function distribute(
  rows: BulkRow[],
  accountIds: string[],
  usernameToId: Map<string, string>,
  mode: "row" | "round_robin" | "all",
  start: Date,
  spacingMinutes: number,
): { plan: PlannedPublication[]; errors: string[] } {
  const plan: PlannedPublication[] = [];
  const errors: string[] = [];
  const perAccountCursor = new Map<string, number>();
  const nextSlot = (acc: string) => {
    const i = perAccountCursor.get(acc) ?? 0;
    perAccountCursor.set(acc, i + 1);
    return new Date(start.getTime() + i * spacingMinutes * 60_000);
  };

  rows.forEach((row, idx) => {
    let targets: string[] = [];
    if (mode === "round_robin") {
      if (!accountIds.length) { errors.push(`Рядок ${idx + 1}: не вибрано акаунтів`); return; }
      targets = [accountIds[idx % accountIds.length]];
    } else if (mode === "row" && row.accounts.length) {
      for (const u of row.accounts) {
        const id = usernameToId.get(u.replace(/^@/, "").toLowerCase());
        if (id) targets.push(id); else errors.push(`Рядок ${idx + 1}: акаунт @${u} не знайдено`);
      }
    } else {
      targets = [...accountIds];
    }
    if (!targets.length) { errors.push(`Рядок ${idx + 1}: немає цільових акаунтів`); return; }

    let explicit: Date | null = null;
    if (row.scheduled_at) {
      const d = new Date(row.scheduled_at);
      if (isNaN(d.getTime())) errors.push(`Рядок ${idx + 1}: некоректна дата "${row.scheduled_at}"`);
      else explicit = d;
    }
    for (const acc of targets) plan.push({ rowIndex: idx, accountId: acc, scheduledAt: explicit ?? nextSlot(acc) });
  });
  return { plan, errors };
}

/** Нормалізація рядка CSV: колонки text, media_urls (через | або пробіл), accounts (через , | ;), scheduled_at, campaign */
export function normalizeRow(r: Record<string, string | undefined>): BulkRow {
  const pick = (...keys: string[]) => {
    for (const k of keys) { const v = r[k] ?? r[k.toUpperCase()]; if (v !== undefined) return v.trim(); }
    return "";
  };
  const split = (s: string, re: RegExp) => s.split(re).map((x) => x.trim()).filter(Boolean);
  return {
    text: pick("text", "content", "текст"),
    media: split(pick("media_urls", "media", "медіа"), /[|\s]+/),
    accounts: split(pick("accounts", "account", "акаунти"), /[,;|]+/),
    scheduled_at: pick("scheduled_at", "date", "дата") || null,
    campaign: pick("campaign", "кампанія") || null,
  };
}
