"use server";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { adminDb } from "@/lib/supabase/admin";
import { log } from "@/lib/log";

export async function saveDefaults(form: FormData) {
  const s = await requireRole("admin");
  const value = {
    timezone: String(form.get("timezone") || "Europe/Kyiv"),
    daily_limit: Math.min(250, Number(form.get("daily_limit") || 50)),
    min_interval_minutes: Number(form.get("min_interval_minutes") || 10),
    max_attempts: Math.min(10, Math.max(1, Number(form.get("max_attempts") || 5))),
  };
  await adminDb().from("app_settings").upsert({ key: "defaults", value, updated_at: new Date().toISOString() });
  await log({ scope: "user", message: "Оновлено налаштування сервісу", actor_id: s.user.id, meta: value });
  revalidatePath("/settings");
}

export async function setUserRole(userId: string, role: "admin" | "editor" | "viewer" | "pending") {
  const s = await requireRole("owner");
  if (!["admin", "editor", "viewer", "pending"].includes(role)) throw new Error("Невідома роль");
  if (userId === s.user.id) throw new Error("Не можна змінити власну роль");
  await adminDb().from("profiles").update({ role }).eq("id", userId);
  await log({ scope: "user", message: `Роль користувача → ${role}`, actor_id: s.user.id, meta: { userId } });
  revalidatePath("/settings");
}

/** Ключі застосунку Meta (Threads API). Лише owner. Порожній Secret = залишити попередній. */
export async function saveThreadsApi(form: FormData) {
  const s = await requireRole("owner");
  const appId = String(form.get("app_id") ?? "").trim();
  const appSecret = String(form.get("app_secret") ?? "").trim();
  if (!/^\d{5,25}$/.test(appId)) throw new Error("App ID має складатися лише з цифр");
  if (appSecret && !/^[a-f0-9]{32}$/i.test(appSecret)) throw new Error("App Secret — 32 символи (0-9, a-f)");
  const { encrypt } = await import("@/lib/crypto");
  const now = new Date().toISOString();
  const rows = [{ key: "threads_app_id", value_enc: encrypt(appId), updated_at: now }];
  if (appSecret) rows.push({ key: "threads_app_secret", value_enc: encrypt(appSecret), updated_at: now });
  const { error } = await adminDb().from("app_secrets").upsert(rows);
  if (error) throw new Error(error.message);
  await log({ scope: "user", message: "Оновлено ключі Threads API", actor_id: s.user.id });
  revalidatePath("/settings"); revalidatePath("/accounts");
}
