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

export async function setUserRole(userId: string, role: "admin" | "editor" | "viewer") {
  const s = await requireRole("owner");
  if (userId === s.user.id) throw new Error("Не можна змінити власну роль");
  await adminDb().from("profiles").update({ role }).eq("id", userId);
  await log({ scope: "user", message: `Роль користувача → ${role}`, actor_id: s.user.id, meta: { userId } });
  revalidatePath("/settings");
}
