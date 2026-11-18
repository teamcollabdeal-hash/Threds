import { NextResponse, type NextRequest } from "next/server";
import { adminDb } from "@/lib/supabase/admin";
import { startPublication, advancePublication } from "@/lib/publisher";
import { refreshTokens, materializeSchedules, syncInsights, checkAllNetworks } from "@/lib/maintenance";
import { log } from "@/lib/log";

/**
 * Automation Engine без окремого сервера.
 * Викликається щохвилини: Supabase pg_cron → POST /api/cron/tick (див. supabase/migrations/0003_no_worker.sql).
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BUDGET_MS = 45_000;
const CONCURRENCY = 6;

async function pool<T>(items: T[], fn: (x: T) => Promise<unknown>, deadline: number) {
  let i = 0;
  const run = async () => { while (i < items.length && Date.now() < deadline) { const x = items[i++]; try { await fn(x); } catch (e) { console.error(e); } } };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, run));
}

/** Обслуговування: кожна задача не частіше за свій інтервал (відмітки в app_settings.maintenance). */
const TASKS: [string, number, () => Promise<unknown>][] = [
  ["schedules", 60_000, materializeSchedules],
  ["network", 15 * 60_000, checkAllNetworks],
  ["insights", 60 * 60_000, syncInsights],
  ["tokens", 6 * 60 * 60_000, refreshTokens],
];

async function maintenance(deadline: number) {
  const db = adminDb();
  const { data } = await db.from("app_settings").select("value").eq("key", "maintenance").maybeSingle();
  const last = (data?.value ?? {}) as Record<string, number>;
  const done: string[] = [];
  for (const [name, every, fn] of TASKS) {
    if (Date.now() > deadline) break;
    if (Date.now() - (last[name] ?? 0) < every - 5_000) continue;
    last[name] = Date.now();
    await db.from("app_settings").upsert({ key: "maintenance", value: last, updated_at: new Date().toISOString() });
    try { await fn(); done.push(name); } catch (e) { await log({ level: "error", scope: "scheduler", message: `${name}: ${(e as Error).message}` }); }
  }
  return done;
}

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const t0 = Date.now();
  const deadline = t0 + BUDGET_MS;
  const db = adminDb();
  const { data: def } = await db.from("app_settings").select("value").eq("key", "defaults").maybeSingle();
  const maxAttempts = Number((def?.value as any)?.max_attempts ?? 5);

  // 0. повернути «завислі» в черзі (виклик обірвався між захопленням і стартом)
  await db.from("publications").update({ status: "scheduled", next_attempt_at: new Date().toISOString() })
    .eq("status", "queued").lt("updated_at", new Date(Date.now() - 10 * 60_000).toISOString());

  // 1. просунути публікації, що вже в процесі (медіа оброблено → опублікувати)
  const { data: inflight } = await db.from("publications").select("id")
    .eq("status", "publishing").lte("next_attempt_at", new Date().toISOString()).order("next_attempt_at").limit(40);
  await pool((inflight ?? []).map((r: { id: string }) => r.id), (id) => advancePublication(id, maxAttempts), deadline);

  // 2. стартувати нові (по одній на акаунт)
  let started = 0;
  if (Date.now() < deadline - 10_000) {
    const { data: due } = await db.rpc("claim_due_publications", { p_limit: 25 });
    started = due?.length ?? 0;
    await pool<string>(((due ?? []) as { id: string }[]).map((r) => r.id), (id) => startPublication(id, maxAttempts), deadline);
  }

  // 3. обслуговування, якщо лишився час
  const tasks = Date.now() < deadline - 5_000 ? await maintenance(deadline) : [];

  return NextResponse.json({ ok: true, advanced: inflight?.length ?? 0, started, tasks, ms: Date.now() - t0 });
}

export const GET = POST;
