/* eslint-disable @typescript-eslint/no-explicit-any */
/** DEMO_MODE=1: in-memory фікстури замість Supabase — лише для перегляду інтерфейсу. */
const H = 3600_000, D = 86400_000, now = Date.now();
const iso = (ms: number) => new Date(ms).toISOString();
const names = ["ardis.kyiv", "rower_express", "zakordonom", "kukirin_ua", "ausom_ua", "ridego_ua", "volt_riders", "dobrobud_ua", "wheelie_bar", "rex_brand", "ebike_warsaw", "scooter_news"];
const statuses = ["active", "active", "active", "active", "active", "rate_limited", "active", "auth_error", "active", "paused", "active", "active"];
const accounts = names.map((u, i) => ({
  id: `acc-${i}`, threads_user_id: String(1000 + i), username: u, display_name: u.replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
  avatar_url: null, biography: "Офіційний акаунт магазину. Електротранспорт, аксесуари та сервіс.", status: statuses[i],
  status_reason: statuses[i] === "auth_error" ? "Error validating access token: session has been invalidated" : statuses[i] === "rate_limited" ? "Application request limit reached" : null,
  token_expires_at: iso(now + (i === 3 ? 6 : 40 + i) * D), token_refreshed_at: iso(now - 3 * D), scopes: [], network_config_id: i % 4 === 0 ? "net-1" : null,
  timezone: i % 3 === 0 ? "Europe/Warsaw" : "Europe/Kyiv", daily_limit: 50, min_interval_minutes: 15, settings: {}, notes: null,
  followers_count: [12400, 8300, 21500, 3100, 5600, 2900, 15800, 1200, 4400, 900, 6700, 9800][i], connected_at: iso(now - (60 - i) * D), updated_at: iso(now),
}));
const texts = [
  "Нова поставка KUKIRIN G2 Max вже в магазині 🛴 Тест-драйв щосуботи з 11:00",
  "Як підготувати електросамокат до зими: 5 простих порад від нашого сервісу",
  "Розпродаж -20% на шоломи та захист до кінця тижня. Посилання в профілі",
  "Surron Light Bee X — що змінилось у моделі 2027 року? Розбираємо",
  "Відкрили запис на сезонне ТО. Перевірка гальм, акумулятора і тиску — 30 хв",
  "Поляки чи українці — хто більше їздить на самокатах у Варшаві? Опитування 👇",
  "Wheelie bar від OFIATECH знову в наявності. Встановлення за 20 хвилин",
  "Ваші фото з вечірньої сходки на Оболоні 🔥 Дякуємо всім, хто прийшов",
];
const pstat = ["published", "published", "published", "scheduled", "scheduled", "published", "failed", "queued", "published", "scheduled", "paused", "draft"];
const campaigns = [
  { id: "c1", name: "Зимовий розпродаж", description: "Знижки на аксесуари", status: "active", starts_at: iso(now - 5 * D), ends_at: iso(now + 20 * D), created_at: iso(now - 6 * D) },
  { id: "c2", name: "Запуск REX", description: "Анонс власного бренду", status: "draft", starts_at: iso(now + 10 * D), ends_at: iso(now + 40 * D), created_at: iso(now - 2 * D) },
  { id: "c3", name: "Сезон ТО", description: null, status: "completed", starts_at: iso(now - 40 * D), ends_at: iso(now - 10 * D), created_at: iso(now - 41 * D) },
];
const pubs = Array.from({ length: 90 }, (_, i) => {
  const st = pstat[i % pstat.length];
  const acc = accounts[i % accounts.length];
  const t = st === "published" || st === "failed" ? now - (i % 14) * D - (i % 9) * H : now + ((i % 20) - 2) * D * 0.7 + (i % 7) * H;
  const text = texts[i % texts.length];
  return {
    id: `pub-${i}`, post_id: `post-${i % 30}`, account_id: acc.id, status: st, scheduled_at: iso(t), published_at: st === "published" ? iso(t) : null,
    permalink: st === "published" ? "https://www.threads.net/@" + acc.username + "/post/X" : null, attempts: st === "failed" ? 5 : 0, threads_media_id: st === "published" ? "m" + i : null,
    error_message: st === "failed" ? "The media could not be fetched from the URI provided" : st === "paused" ? "Акаунт потребує повторної авторизації" : null,
    account: { id: acc.id, username: acc.username },
    post: { text, media: i % 3 === 0 ? [{ url: "x", kind: "image" }] : [], campaign_id: i % 4 === 0 ? "c1" : null, campaign: i % 4 === 0 ? { name: "Зимовий розпродаж" } : null },
    insight: st === "published" ? { views: 800 + ((i * 937) % 9000), likes: 20 + ((i * 53) % 400), replies: (i * 7) % 40, reposts: (i * 3) % 25 } : null,
  };
});
const groups = [
  { id: "g1", kind: "project", name: "Ardis", color: "#4f46e5" }, { id: "g2", kind: "project", name: "Rower Express", color: "#0891b2" },
  { id: "g3", kind: "country", name: "Україна", color: "#ca8a04" }, { id: "g4", kind: "country", name: "Польща", color: "#dc2626" },
  { id: "g5", kind: "topic", name: "Самокати", color: "#16a34a" }, { id: "g6", kind: "topic", name: "Мото", color: "#9333ea" },
];
const members = accounts.flatMap((a, i) => [{ group_id: i % 2 ? "g2" : "g1", account_id: a.id }, { group_id: i % 3 ? "g3" : "g4", account_id: a.id }, { group_id: i % 4 === 1 ? "g6" : "g5", account_id: a.id }]);
const account_stats = accounts.map((a, i) => {
  const mine = pubs.filter((p) => p.account_id === a.id);
  return { account_id: a.id, published: mine.filter((p) => p.status === "published").length + 20 + i * 3, scheduled: mine.filter((p) => ["scheduled", "queued"].includes(p.status)).length,
    failed: mine.filter((p) => p.status === "failed").length, published_24h: (i * 3) % 9 };
});
const logs = [
  ["info", "publish", "Опубліковано @ardis.kyiv", "acc-0"], ["warn", "publish", "Спроба 2/5 невдала (rate_limit): Application request limit reached. Повтор о 12:45", "acc-5"],
  ["error", "auth", "Помилка авторизації @dobrobud_ua: session has been invalidated. Публікації акаунта призупинено", "acc-7"],
  ["info", "token", "Продовжено токенів: 4", null], ["info", "scheduler", "Планувальник: тік виконано за 3.2 с", null],
  ["error", "publish", "Публікацію не виконано: The media could not be fetched from the URI provided", "acc-6"],
  ["info", "user", "Bulk імпорт: 24 постів → 96 публікацій", null], ["warn", "network", "Мережева конфігурація недоступна: connect ETIMEDOUT", null],
  ["info", "auth", "Підключено акаунт @scooter_news", "acc-11"], ["info", "publish", "Відкладено: Мінімальний інтервал 15 хв", "acc-2"],
].map(([level, scope, message, account_id], i) => ({ id: i, level, scope, message, account_id, meta: i === 1 ? { code: 4, attempt: 2 } : {}, created_at: iso(now - i * 47 * 60_000),
  account: account_id ? { username: accounts.find((a) => a.id === account_id)!.username } : null }));
const network_configs = [
  { id: "net-1", name: "Офіс Київ", protocol: "http", host: "10.0.0.15", port: 3128, username: "office", status: "ok", last_checked_at: iso(now - 9 * 60_000), last_latency_ms: 184, last_error: null, created_at: iso(now) },
  { id: "net-2", name: "Варшава SOCKS", protocol: "socks5", host: "proxy.example.pl", port: 1080, username: null, status: "error", last_checked_at: iso(now - 12 * 60_000), last_latency_ms: null, last_error: "connect ETIMEDOUT", created_at: iso(now) },
];
const schedules = [
  { id: "s1", post: { text: texts[1] }, frequency: "weekly", times: ["09:00", "18:30"], weekdays: [1, 3, 5], interval_minutes: null, timezone: "Europe/Kyiv", account_ids: ["acc-0", "acc-1", "acc-2"], next_run_at: iso(now + 5 * H), active: true },
  { id: "s2", post: { text: texts[4] }, frequency: "daily", times: ["10:00"], weekdays: [], interval_minutes: null, timezone: "Europe/Warsaw", account_ids: ["acc-1"], next_run_at: iso(now + 22 * H), active: true },
  { id: "s3", post: { text: texts[0] }, frequency: "interval", times: [], weekdays: [], interval_minutes: 240, timezone: "Europe/Kyiv", account_ids: ["acc-3", "acc-4"], next_run_at: null, active: false },
];
const profiles = [
  { id: "u1", email: "anton@ardis.kyiv.ua", role: "owner", created_at: iso(now - 30 * D) },
  { id: "u2", email: "smm@rowerexpress.pl", role: "editor", created_at: iso(now - 20 * D) },
  { id: "u3", email: "manager@ardis.kyiv.ua", role: "viewer", created_at: iso(now - 5 * D) },
];
const tables: Record<string, any[]> = {
  accounts, publications: pubs, campaigns, account_groups: groups, account_group_members: members, account_stats, logs, network_configs, schedules, profiles,
  app_settings: [{ key: "defaults", value: { timezone: "Europe/Kyiv", daily_limit: 50, min_interval_minutes: 15, max_attempts: 5 } }],
  account_insights: [{ account_id: "acc-0", day: "2026-11-16", views: 18420, likes: 812, replies: 64 }],
};
const overview = { accounts_total: 12, accounts_active: 9, accounts_problem: 2, published_total: 1284, published_24h: 37, scheduled: 214, failed: 6, views_total: 482300, likes_total: 19870 };

function builder(table: string) {
  let rows = [...(tables[table] ?? [])];
  let single = false;
  const b: any = {
    select: () => b, order: () => b, limit: (n: number) => { rows = rows.slice(0, n); return b; }, range: (a: number, z: number) => { rows = rows.slice(a, z + 1); return b; },
    eq: (k: string, v: any) => { if (rows[0] && k in rows[0]) rows = rows.filter((r) => r[k] === v); return b; },
    neq: (k: string, v: any) => { if (rows[0] && k in rows[0]) rows = rows.filter((r) => r[k] !== v); return b; },
    in: (k: string, v: any[]) => { if (rows[0] && k in rows[0]) rows = rows.filter((r) => v.includes(r[k])); return b; },
    gte: () => b, lt: () => b, lte: () => b, not: () => b, or: () => b, ilike: () => b,
    single: () => { single = true; return b; }, maybeSingle: () => { single = true; return b; },
    then: (res: any) => res({ data: single ? rows[0] ?? null : rows, count: (tables[table] ?? []).length, error: null }),
  };
  return b;
}

export function demoDb(): any {
  return {
    from: builder,
    rpc: async () => ({ data: overview, error: null }),
    auth: { getUser: async () => ({ data: { user: { id: "u1", email: "anton@ardis.kyiv.ua" } } }), signOut: async () => ({}) },
    storage: { from: () => ({}) },
  };
}
