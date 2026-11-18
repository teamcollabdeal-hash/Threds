import { cache } from "react";
import { adminDb } from "../supabase/admin";
import { decrypt } from "../crypto";

export interface ThreadsCreds { appId: string; appSecret: string; source: "panel" | "env" }

/** Ключі застосунку Meta: спершу з панелі (Settings → Threads API), інакше зі змінних середовища. */
export const getThreadsCreds = cache(async (): Promise<ThreadsCreds | null> => {
  try {
    const { data } = await adminDb().from("app_secrets").select("key, value_enc").in("key", ["threads_app_id", "threads_app_secret"]);
    const m = Object.fromEntries((data ?? []).map((r) => [r.key, decrypt(r.value_enc)]));
    if (m.threads_app_id && m.threads_app_secret) return { appId: m.threads_app_id, appSecret: m.threads_app_secret, source: "panel" };
  } catch { /* таблиця ще не створена — беремо env */ }
  const appId = process.env.THREADS_APP_ID, appSecret = process.env.THREADS_APP_SECRET;
  return appId && appSecret ? { appId, appSecret, source: "env" } : null;
});

export async function requireThreadsCreds(): Promise<ThreadsCreds> {
  const c = await getThreadsCreds();
  if (!c) throw new Error("Не вказано Threads App ID / App Secret (Settings → Threads API)");
  return c;
}
