import { fetch } from "undici";
import { adminDb } from "./supabase/admin";
import { encrypt } from "./crypto";
import { loadAccountToken, loadProxy, clientForAccount } from "./accounts";
import { refreshLongLived } from "./threads/oauth";
import { ThreadsApiError } from "./threads/errors";
import { metricValue } from "./threads/client";
import { dispatcherFor } from "./net/proxy";
import { nextRun } from "./schedule";
import { log } from "./log";

/** Продовження long-lived токенів: раз на 7 днів, або якщо до завершення < 10 днів. */
export async function refreshTokens() {
  const db = adminDb();
  const now = Date.now();
  const { data: accs } = await db.from("accounts").select("id, username, token_expires_at, token_refreshed_at, connected_at, status")
    .neq("status", "disconnected");
  let refreshed = 0;
  for (const a of accs ?? []) {
    const exp = a.token_expires_at ? new Date(a.token_expires_at).getTime() : 0;
    const last = new Date(a.token_refreshed_at ?? a.connected_at).getTime();
    if (exp && exp < now) {
      await db.from("accounts").update({ status: "auth_error", status_reason: "Токен протермінований" }).eq("id", a.id);
      continue;
    }
    const due = now - last > 7 * 86400_000 || (exp && exp - now < 10 * 86400_000);
    if (!due || now - last < 24 * 3600_000) continue;
    try {
      const token = await loadAccountToken(a.id);
      if (!token) continue;
      const r = await refreshLongLived(token);
      await db.from("account_secrets").upsert({ account_id: a.id, access_token_enc: encrypt(r.access_token), updated_at: new Date().toISOString() });
      await db.from("accounts").update({
        token_expires_at: new Date(now + r.expires_in * 1000).toISOString(),
        token_refreshed_at: new Date().toISOString(),
      }).eq("id", a.id);
      refreshed++;
    } catch (e) {
      const auth = e instanceof ThreadsApiError && e.kind === "auth";
      if (auth) await db.from("accounts").update({ status: "auth_error", status_reason: (e as Error).message }).eq("id", a.id);
      await log({ level: auth ? "error" : "warn", scope: "token", message: `Не вдалося продовжити токен @${a.username}: ${(e as Error).message}`, account_id: a.id });
    }
  }
  if (refreshed) await log({ scope: "token", message: `Продовжено токенів: ${refreshed}` });
}

/** Перетворює повторювані розклади на конкретні публікації (на 1 запуск уперед). */
export async function materializeSchedules() {
  const db = adminDb();
  const { data: rows } = await db.from("schedules").select("*").eq("active", true)
    .or(`next_run_at.is.null,next_run_at.lte.${new Date(Date.now() + 60_000).toISOString()}`);
  for (const s of rows ?? []) {
    let runAt = s.next_run_at ? new Date(s.next_run_at) : nextRun(s, new Date());
    if (!runAt) { await db.from("schedules").update({ active: false }).eq("id", s.id); continue; }
    if (runAt.getTime() <= Date.now() + 60_000) {
      const pubs = (s.account_ids as string[]).map((account_id) => ({
        post_id: s.post_id, account_id, schedule_id: s.id, scheduled_at: runAt!.toISOString(), status: "scheduled",
      }));
      await db.from("publications").upsert(pubs, { onConflict: "schedule_id,account_id,scheduled_at", ignoreDuplicates: true });
      runAt = nextRun(s, runAt);
    }
    await db.from("schedules").update({ next_run_at: runAt?.toISOString() ?? null, active: !!runAt }).eq("id", s.id);
  }
}

/** Статистика постів за 30 днів + профілю за добу. */
export async function syncInsights() {
  const db = adminDb();
  const since = new Date(Date.now() - 30 * 86400_000).toISOString();
  const { data: accs } = await db.from("accounts").select("id, username, threads_user_id, network_config_id, status, scopes").eq("status", "active");
  for (const acc of accs ?? []) {
    try {
      const client = await clientForAccount(acc);
      const { data: pubs } = await db.from("publications").select("id, threads_media_id")
        .eq("account_id", acc.id).eq("status", "published").gte("published_at", since).not("threads_media_id", "is", null);
      for (const p of pubs ?? []) {
        try {
          const r = await client.mediaInsights(p.threads_media_id!);
          const m = Object.fromEntries(r.data.map((x) => [x.name, metricValue(x)]));
          await db.from("publication_insights").upsert({ publication_id: p.id, ...m, fetched_at: new Date().toISOString() });
        } catch (e) {
          if (e instanceof ThreadsApiError && e.kind !== "content") throw e;
        }
      }
      const until = Math.floor(Date.now() / 1000);
      const ui = await client.userInsights(until - 86400, until);
      const m = Object.fromEntries(ui.data.map((x) => [x.name, metricValue(x)]));
      const day = new Date().toISOString().slice(0, 10);
      await db.from("account_insights").upsert({ account_id: acc.id, day, ...m });
      if (m.followers_count !== undefined) await db.from("accounts").update({ followers_count: m.followers_count }).eq("id", acc.id);
    } catch (e) {
      await log({ level: "warn", scope: "insights", message: `Статистику @${acc.username} не отримано: ${(e as Error).message}`, account_id: acc.id });
    }
  }
}

/** Перевірка доступності graph.threads.net через мережеву конфігурацію. */
export async function checkNetwork(id: string) {
  const db = adminDb();
  const spec = await loadProxy(id);
  if (!spec) return { ok: false, error: "Конфігурацію не знайдено" };
  const t0 = Date.now();
  try {
    const res = await fetch("https://graph.threads.net/v1.0/", { dispatcher: dispatcherFor(spec), signal: AbortSignal.timeout(15_000) });
    await res.arrayBuffer();
    const latency = Date.now() - t0;
    await db.from("network_configs").update({ status: "ok", last_latency_ms: latency, last_error: null, last_checked_at: new Date().toISOString() }).eq("id", id);
    return { ok: true, latency };
  } catch (e) {
    const msg = (e as Error).cause ? String((e as any).cause?.message ?? e) : (e as Error).message;
    await db.from("network_configs").update({ status: "error", last_error: msg, last_checked_at: new Date().toISOString() }).eq("id", id);
    await log({ level: "warn", scope: "network", message: `Мережева конфігурація недоступна: ${msg}`, meta: { id } });
    return { ok: false, error: msg };
  }
}

export async function checkAllNetworks() {
  const { data } = await adminDb().from("network_configs").select("id");
  for (const n of data ?? []) await checkNetwork(n.id);
}
