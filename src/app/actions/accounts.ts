"use server";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { adminDb } from "@/lib/supabase/admin";
import { clientForAccount } from "@/lib/accounts";
import { log } from "@/lib/log";

export async function updateAccountSettings(id: string, form: FormData) {
  const s = await requireRole("admin");
  const patch = {
    timezone: String(form.get("timezone") || "Europe/Kyiv"),
    daily_limit: Math.min(250, Math.max(1, Number(form.get("daily_limit") || 50))),
    min_interval_minutes: Math.max(0, Number(form.get("min_interval_minutes") || 0)),
    network_config_id: (form.get("network_config_id") as string) || null,
    notes: (form.get("notes") as string) || null,
  };
  await adminDb().from("accounts").update(patch).eq("id", id);
  const groups = form.getAll("groups").map(String);
  await adminDb().from("account_group_members").delete().eq("account_id", id);
  if (groups.length) await adminDb().from("account_group_members").insert(groups.map((group_id) => ({ group_id, account_id: id })));
  await log({ scope: "user", message: "Оновлено налаштування акаунта", account_id: id, actor_id: s.user.id, meta: patch });
  revalidatePath(`/accounts/${id}`);
}

export async function setAccountStatus(id: string, status: "active" | "paused" | "disconnected") {
  const s = await requireRole("admin");
  const db = adminDb();
  await db.from("accounts").update({ status, status_reason: null }).eq("id", id);
  if (status === "disconnected") {
    await db.from("account_secrets").delete().eq("account_id", id); // відкликання доступу: токен знищено
    await db.from("publications").update({ status: "cancelled" }).eq("account_id", id).in("status", ["scheduled", "queued", "paused"]);
  }
  if (status === "paused") await db.from("publications").update({ status: "paused" }).eq("account_id", id).in("status", ["scheduled"]);
  if (status === "active") await db.from("publications").update({ status: "scheduled" }).eq("account_id", id).eq("status", "paused");
  await log({ scope: "user", message: `Статус акаунта → ${status}`, account_id: id, actor_id: s.user.id });
  revalidatePath("/accounts"); revalidatePath(`/accounts/${id}`);
}

export async function deleteAccount(id: string) {
  const s = await requireRole("owner");
  await adminDb().from("accounts").delete().eq("id", id);
  await log({ scope: "user", message: "Акаунт видалено", actor_id: s.user.id, meta: { id } });
  revalidatePath("/accounts");
}

export async function bulkAccountAction(ids: string[], action: "pause" | "resume" | "group", groupId?: string) {
  await requireRole("admin");
  for (const id of ids) {
    if (action === "pause") await setAccountStatus(id, "paused");
    if (action === "resume") await setAccountStatus(id, "active");
    if (action === "group" && groupId)
      await adminDb().from("account_group_members").upsert({ group_id: groupId, account_id: id }, { ignoreDuplicates: true });
  }
  revalidatePath("/accounts");
}

export async function createGroup(form: FormData) {
  await requireRole("editor");
  const name = String(form.get("name") || "").trim();
  if (!name) return;
  await adminDb().from("account_groups").insert({ name, kind: String(form.get("kind") || "project"), color: String(form.get("color") || "#6366f1") });
  revalidatePath("/accounts");
}

export async function deleteGroup(id: string) {
  await requireRole("admin");
  await adminDb().from("account_groups").delete().eq("id", id);
  revalidatePath("/accounts");
}

export async function checkQuota(id: string): Promise<{ usage?: number; total?: number; error?: string }> {
  await requireRole("viewer");
  const { data: acc } = await adminDb().from("accounts").select("id, threads_user_id, network_config_id").eq("id", id).single();
  if (!acc) return { error: "not found" };
  try {
    const r = await (await clientForAccount(acc)).publishingLimit();
    return { usage: r.data[0]?.quota_usage, total: r.data[0]?.config?.quota_total };
  } catch (e) { return { error: (e as Error).message }; }
}
