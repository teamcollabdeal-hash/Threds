import { adminDb } from "./supabase/admin";
import { clientForAccount } from "./accounts";
import { ThreadsApiError } from "./threads/errors";
import type { ThreadsClient } from "./threads/client";
import { decideRetry, quotaGate } from "./retry";
import { log } from "./log";
import type { MediaItem } from "./types";

/**
 * Публікація без фонового сервера — покроково, кожен крок займає секунди:
 *   start   → перевірки лімітів, створення контейнера(ів), статус 'publishing'
 *   advance → (наступний тік) перевірка обробки медіа → публікація → 'published'
 * Повторний крок ніколи не дублює пост: контейнер зберігається, статус PUBLISHED перевіряється.
 */

const PROCESSING_TIMEOUT_MS = 20 * 60_000;
const later = (s: number) => new Date(Date.now() + s * 1000).toISOString();

type Post = { text: string; media: MediaItem[]; link_attachment: string | null; topic_tag: string | null };

async function loadPub(id: string) {
  const { data } = await adminDb().from("publications").select("*, post:posts(*), account:accounts(*)").eq("id", id).single();
  return data;
}

async function createContainers(client: ThreadsClient, post: Post) {
  const media = post.media ?? [];
  const common = { text: post.text || undefined, topic_tag: post.topic_tag ?? undefined };
  if (media.length === 0)
    return { container: (await client.createContainer({ media_type: "TEXT", ...common, link_attachment: post.link_attachment ?? undefined })).id, children: [] as string[] };
  if (media.length === 1) {
    const m = media[0];
    const c = await client.createContainer({ media_type: m.kind === "video" ? "VIDEO" : "IMAGE", ...common, ...(m.kind === "video" ? { video_url: m.url } : { image_url: m.url }) });
    return { container: c.id, children: [] as string[] };
  }
  const children: string[] = [];
  for (const m of media) {
    const c = await client.createContainer({ media_type: m.kind === "video" ? "VIDEO" : "IMAGE", is_carousel_item: true, ...(m.kind === "video" ? { video_url: m.url } : { image_url: m.url }) });
    children.push(c.id);
  }
  return { container: null, children };
}

async function finish(pub: any, client: ThreadsClient, containerId: string, alreadyPublished = false) {
  const db = adminDb();
  let mediaId: string | null = null, permalink: string | null = null;
  if (!alreadyPublished) {
    mediaId = (await client.publish(containerId)).id;
    try { permalink = (await client.media(mediaId)).permalink ?? null; } catch { /* не критично */ }
  }
  await db.from("publications").update({
    status: "published", threads_media_id: mediaId, permalink, published_at: new Date().toISOString(), next_attempt_at: null,
  }).eq("id", pub.id);
  if (pub.account.status === "rate_limited") await db.from("accounts").update({ status: "active", status_reason: null }).eq("id", pub.account.id);
  await log({ scope: "publish", message: `Опубліковано @${pub.account.username}`, account_id: pub.account.id, publication_id: pub.id, meta: { mediaId, permalink } });
  return "published";
}

async function handleError(pub: any, e: unknown, maxAttempts: number) {
  const db = adminDb();
  const acc = pub.account;
  const ctx = { account_id: acc.id, publication_id: pub.id };
  const err = e instanceof ThreadsApiError ? e : new ThreadsApiError((e as Error).message, "unknown");
  const kind = err.kind === "unknown" ? "transient" : err.kind;
  const decision = decideRetry(kind, pub.attempts, maxAttempts);
  const base = { error_code: err.code ? String(err.code) : kind, error_message: err.message, processing_started_at: null };

  if (decision.action === "pause_account") {
    await db.from("accounts").update({ status: "auth_error", status_reason: err.message }).eq("id", acc.id);
    await db.from("publications").update({ status: "paused", ...base }).eq("id", pub.id);
    await db.from("publications").update({ status: "paused", error_message: "Акаунт потребує повторної авторизації" })
      .eq("account_id", acc.id).in("status", ["scheduled", "queued"]);
    await log({ level: "error", scope: "auth", message: `Помилка авторизації @${acc.username}: ${err.message}. Публікації акаунта призупинено`, ...ctx });
    return "auth_error";
  }
  if (decision.action === "retry") {
    await db.from("publications").update({ status: "scheduled", next_attempt_at: decision.at.toISOString(), ...base }).eq("id", pub.id);
    if (kind === "rate_limit") await db.from("accounts").update({ status: "rate_limited", status_reason: err.message }).eq("id", acc.id);
    await log({ level: "warn", scope: "publish", message: `Спроба ${pub.attempts}/${maxAttempts} невдала (${kind}): ${err.message}. Повтор о ${decision.at.toISOString()}`, ...ctx });
    return "retry";
  }
  await db.from("publications").update({ status: "failed", ...base, container_id: null, child_containers: [] }).eq("id", pub.id);
  await log({ level: "error", scope: "publish", message: `Публікацію не виконано: ${err.message}`, ...ctx, meta: { code: err.code, subcode: err.subcode } });
  return "failed";
}

/** Крок 1: публікація захоплена диспетчером (status='queued'). */
export async function startPublication(id: string, maxAttempts = 5): Promise<string> {
  const db = adminDb();
  const pub = await loadPub(id);
  if (!pub || pub.status !== "queued") return "skip";
  const acc = pub.account;

  if (acc.status !== "active" && acc.status !== "rate_limited") {
    await db.from("publications").update({ status: "paused", error_message: `Акаунт у статусі ${acc.status}` }).eq("id", id);
    return "paused";
  }
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { data: recent } = await db.from("publications").select("published_at").eq("account_id", acc.id).eq("status", "published").gte("published_at", since);
  const gate = quotaGate({ publishedLast24h: (recent ?? []).map((r) => new Date(r.published_at)), dailyLimit: acc.daily_limit, minIntervalMinutes: acc.min_interval_minutes });
  if (!gate.ok) {
    await db.from("publications").update({ status: "scheduled", next_attempt_at: gate.retryAt.toISOString() }).eq("id", id);
    await log({ scope: "publish", message: `Відкладено: ${gate.reason}`, account_id: acc.id, publication_id: id });
    return "deferred";
  }

  pub.attempts += 1;
  await db.from("publications").update({ status: "publishing", attempts: pub.attempts, error_message: null, error_code: null, processing_started_at: new Date().toISOString() }).eq("id", id);
  try {
    const client = await clientForAccount(acc);
    // повтор після збою: контейнер уже є — просто переходимо до кроку 2
    if (pub.container_id || pub.child_containers?.length) {
      await db.from("publications").update({ next_attempt_at: later(0) }).eq("id", id);
      return advancePublication(id, maxAttempts);
    }
    const { container, children } = await createContainers(client, pub.post);
    const hasVideo = (pub.post.media ?? []).some((m: MediaItem) => m.kind === "video");
    await db.from("publications").update({ container_id: container, child_containers: children, next_attempt_at: later(hasVideo ? 60 : 25) }).eq("id", id);
    return "started";
  } catch (e) {
    return handleError(pub, e, maxAttempts);
  }
}

/** Крок 2: перевірка обробки контейнера і публікація. Викликається на наступних тіках. */
export async function advancePublication(id: string, maxAttempts = 5): Promise<string> {
  const db = adminDb();
  const pub = await loadPub(id);
  if (!pub || pub.status !== "publishing") return "skip";
  try {
    const client = await clientForAccount(pub.account);
    const started = pub.processing_started_at ? new Date(pub.processing_started_at).getTime() : Date.now();
    if (Date.now() - started > PROCESSING_TIMEOUT_MS) throw new ThreadsApiError("Медіа не оброблено за 20 хв", "transient");

    // карусель: спершу дочекатися всіх елементів, потім створити батьківський контейнер
    if (!pub.container_id && pub.child_containers?.length) {
      for (const cid of pub.child_containers as string[]) {
        const s = await client.containerStatus(cid);
        if (s.status === "ERROR" || s.status === "EXPIRED") throw new ThreadsApiError(`Елемент каруселі ${s.status}: ${s.error_message ?? ""}`, "content");
        if (s.status !== "FINISHED") { await db.from("publications").update({ next_attempt_at: later(30) }).eq("id", id); return "waiting"; }
      }
      const parent = await client.createContainer({ media_type: "CAROUSEL", children: pub.child_containers, text: pub.post.text || undefined, topic_tag: pub.post.topic_tag ?? undefined });
      await db.from("publications").update({ container_id: parent.id, next_attempt_at: later(20) }).eq("id", id);
      return "waiting";
    }

    const s = await client.containerStatus(pub.container_id);
    if (s.status === "PUBLISHED") return finish(pub, client, pub.container_id, true);
    if (s.status === "FINISHED") return finish(pub, client, pub.container_id);
    if (s.status === "ERROR" || s.status === "EXPIRED") {
      await db.from("publications").update({ container_id: null, child_containers: [] }).eq("id", id);
      throw new ThreadsApiError(`Контейнер ${s.status}: ${s.error_message ?? ""}`, s.status === "EXPIRED" ? "transient" : "content");
    }
    await db.from("publications").update({ next_attempt_at: later(30) }).eq("id", id);
    return "waiting";
  } catch (e) {
    return handleError(pub, e, maxAttempts);
  }
}
