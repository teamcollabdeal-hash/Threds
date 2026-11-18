"use server";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { adminDb } from "@/lib/supabase/admin";
import { distribute, type BulkRow } from "@/lib/distribute";
import { validatePost } from "@/lib/validate";
import { log } from "@/lib/log";

const guessKind = (u: string): "image" | "video" => (/\.(mp4|mov)(\?|$)/i.test(u) ? "video" : "image");

export async function importBulk(input: {
  rows: BulkRow[]; account_ids: string[]; mode: "row" | "round_robin" | "all";
  start: string; spacing_minutes: number; campaign_name?: string | null; as_draft?: boolean;
}): Promise<{ ok: boolean; created?: number; errors: string[] }> {
  const s = await requireRole("editor");
  const db = adminDb();
  if (input.rows.length > 5000) return { ok: false, errors: ["Максимум 5000 рядків за один імпорт"] };

  const { data: accs } = await db.from("accounts").select("id, username").neq("status", "disconnected");
  const map = new Map((accs ?? []).map((a) => [a.username.toLowerCase(), a.id]));
  const errors: string[] = [];
  input.rows.forEach((r, i) => {
    const e = validatePost({ text: r.text, media: r.media.map((url) => ({ url, kind: guessKind(url) })) });
    e.forEach((x) => errors.push(`Рядок ${i + 1}: ${x}`));
  });
  const { plan, errors: distErrors } = distribute(input.rows, input.account_ids, map, input.mode, new Date(input.start), input.spacing_minutes);
  errors.push(...distErrors);
  if (errors.length) return { ok: false, errors };

  let campaignId: string | null = null;
  if (input.campaign_name?.trim()) {
    const { data } = await db.from("campaigns").insert({ name: input.campaign_name.trim(), status: input.as_draft ? "draft" : "active", created_by: s.user.id }).select("id").single();
    campaignId = data?.id ?? null;
  }
  const postRows = input.rows.map((r) => ({
    text: r.text, media: r.media.map((url) => ({ url, kind: guessKind(url) })), campaign_id: campaignId, source: "bulk", created_by: s.user.id,
  }));
  const postIds: string[] = [];
  for (let i = 0; i < postRows.length; i += 500) {
    const { data, error } = await db.from("posts").insert(postRows.slice(i, i + 500)).select("id");
    if (error) return { ok: false, errors: [error.message] };
    postIds.push(...data.map((d) => d.id));
  }
  const pubs = plan.map((p) => ({ post_id: postIds[p.rowIndex], account_id: p.accountId, scheduled_at: p.scheduledAt.toISOString(), status: input.as_draft ? "draft" : "scheduled" }));
  for (let i = 0; i < pubs.length; i += 1000) {
    const { error } = await db.from("publications").insert(pubs.slice(i, i + 1000));
    if (error) return { ok: false, errors: [error.message] };
  }
  await log({ scope: "user", message: `Bulk імпорт: ${postIds.length} постів → ${pubs.length} публікацій`, actor_id: s.user.id, meta: { campaignId, mode: input.mode } });
  revalidatePath("/posts"); revalidatePath("/scheduler"); revalidatePath("/campaigns");
  return { ok: true, created: pubs.length, errors: [] };
}
