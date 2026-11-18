"use server";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { adminDb } from "@/lib/supabase/admin";
import { validatePost } from "@/lib/validate";
import { nextRun } from "@/lib/schedule";
import { clientForAccount } from "@/lib/accounts";
import { log } from "@/lib/log";
import type { MediaItem } from "@/lib/types";

export interface ComposerInput {
  text: string; media: MediaItem[]; link_attachment?: string | null; topic_tag?: string | null;
  campaign_id?: string | null; account_ids: string[];
  mode: "now" | "schedule" | "recurring" | "draft";
  scheduled_at?: string | null;          // ISO
  per_account_offset_minutes?: number;   // індивідуальний зсув між акаунтами
  recurrence?: { frequency: "daily" | "weekly" | "interval"; times: string[]; weekdays: number[]; interval_minutes?: number; timezone: string; ends_at?: string | null };
}

export async function createPost(input: ComposerInput): Promise<{ ok: boolean; errors?: string[]; postId?: string }> {
  const s = await requireRole("editor");
  const errors = validatePost({ text: input.text, media: input.media, link_attachment: input.link_attachment });
  if (input.mode !== "draft" && !input.account_ids.length) errors.push("Виберіть хоча б один акаунт");
  if (input.mode === "schedule" && !input.scheduled_at) errors.push("Вкажіть дату і час");
  if (errors.length) return { ok: false, errors };

  const db = adminDb();
  const { data: post, error } = await db.from("posts").insert({
    text: input.text, media: input.media, link_attachment: input.link_attachment || null, topic_tag: input.topic_tag || null,
    campaign_id: input.campaign_id || null, source: input.mode === "recurring" ? "recurring" : "composer", created_by: s.user.id,
  }).select("id").single();
  if (error || !post) return { ok: false, errors: [error?.message ?? "DB error"] };

  if (input.mode === "recurring" && input.recurrence) {
    const rule = { ...input.recurrence, starts_at: new Date().toISOString() };
    const next = nextRun(rule, new Date());
    await db.from("schedules").insert({
      post_id: post.id, account_ids: input.account_ids, frequency: rule.frequency, times: rule.times, weekdays: rule.weekdays,
      interval_minutes: rule.interval_minutes ?? null, timezone: rule.timezone, starts_at: rule.starts_at, ends_at: rule.ends_at || null,
      next_run_at: next?.toISOString() ?? null, active: !!next,
    });
  } else {
    const base = input.mode === "schedule" ? new Date(input.scheduled_at!) : new Date();
    const step = (input.per_account_offset_minutes ?? 0) * 60_000;
    const rows = input.account_ids.map((account_id, i) => ({
      post_id: post.id, account_id, scheduled_at: new Date(base.getTime() + i * step).toISOString(),
      status: input.mode === "draft" ? "draft" : "scheduled",
    }));
    if (rows.length) await db.from("publications").insert(rows);
  }
  await log({ scope: "user", message: `Створено пост (${input.mode}) для ${input.account_ids.length} акаунтів`, actor_id: s.user.id, meta: { post_id: post.id } });
  revalidatePath("/posts"); revalidatePath("/scheduler");
  return { ok: true, postId: post.id };
}

export async function updatePostContent(postId: string, form: FormData) {
  await requireRole("editor");
  const text = String(form.get("text") ?? "");
  const db = adminDb();
  const { data: post } = await db.from("posts").select("media, link_attachment").eq("id", postId).single();
  const errs = validatePost({ text, media: post?.media ?? [], link_attachment: post?.link_attachment });
  if (errs.length) throw new Error(errs.join("; "));
  const { count } = await db.from("publications").select("id", { count: "exact", head: true })
    .eq("post_id", postId).in("status", ["published", "publishing"]);
  if (count) throw new Error("Пост уже опубліковано хоча б на одному акаунті — редагування опублікованого контенту Threads API не підтримує. Створіть новий пост.");
  await db.from("posts").update({ text }).eq("id", postId);
  revalidatePath("/posts");
}

export async function reschedulePublication(id: string, form: FormData) {
  await requireRole("editor");
  const at = String(form.get("iso") || form.get("scheduled_at"));
  await adminDb().from("publications").update({ scheduled_at: new Date(at).toISOString(), next_attempt_at: null, status: "scheduled" })
    .eq("id", id).in("status", ["scheduled", "draft", "paused", "failed"]);
  revalidatePath("/posts"); revalidatePath("/scheduler");
}

export async function cancelPublications(ids: string[]) {
  const s = await requireRole("editor");
  await adminDb().from("publications").update({ status: "cancelled" }).in("id", ids).in("status", ["scheduled", "draft", "paused", "failed", "queued"]);
  await log({ scope: "user", message: `Скасовано публікацій: ${ids.length}`, actor_id: s.user.id });
  revalidatePath("/posts"); revalidatePath("/scheduler");
}

export async function retryPublications(ids: string[]) {
  await requireRole("editor");
  await adminDb().from("publications").update({ status: "scheduled", attempts: 0, next_attempt_at: null, error_message: null, error_code: null })
    .in("id", ids).in("status", ["failed", "cancelled", "paused", "draft"]);
  revalidatePath("/posts");
}

export async function deletePublished(id: string) {
  const s = await requireRole("admin");
  const db = adminDb();
  const { data: p } = await db.from("publications").select("*, account:accounts(id, threads_user_id, network_config_id)").eq("id", id).single();
  if (!p?.threads_media_id) throw new Error("Немає media id");
  await (await clientForAccount(p.account)).deleteMedia(p.threads_media_id);
  await db.from("publications").update({ status: "cancelled", error_message: "Видалено з Threads" }).eq("id", id);
  await log({ scope: "user", message: "Пост видалено з Threads", publication_id: id, account_id: p.account.id, actor_id: s.user.id });
  revalidatePath("/posts");
}

export async function toggleSchedule(id: string, active: boolean) {
  await requireRole("editor");
  await adminDb().from("schedules").update({ active }).eq("id", id);
  revalidatePath("/scheduler");
}
