"use server";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { adminDb } from "@/lib/supabase/admin";

export async function createCampaign(form: FormData) {
  const s = await requireRole("editor");
  const name = String(form.get("name") || "").trim();
  if (!name) return;
  await adminDb().from("campaigns").insert({
    name, description: (form.get("description") as string) || null, status: "draft", created_by: s.user.id,
    starts_at: form.get("starts_at") ? new Date(String(form.get("starts_at"))).toISOString() : null,
    ends_at: form.get("ends_at") ? new Date(String(form.get("ends_at"))).toISOString() : null,
  });
  revalidatePath("/campaigns");
}

export async function setCampaignStatus(id: string, status: "draft" | "active" | "paused" | "completed") {
  await requireRole("editor");
  const db = adminDb();
  await db.from("campaigns").update({ status }).eq("id", id);
  const { data: posts } = await db.from("posts").select("id").eq("campaign_id", id);
  const ids = (posts ?? []).map((p) => p.id);
  if (ids.length) {
    if (status === "paused") await db.from("publications").update({ status: "paused" }).in("post_id", ids).eq("status", "scheduled");
    if (status === "active") await db.from("publications").update({ status: "scheduled" }).in("post_id", ids).in("status", ["paused", "draft"]);
  }
  revalidatePath("/campaigns");
}
