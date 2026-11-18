import { fetch, type Dispatcher } from "undici";
import { ThreadsApiError, classify } from "./errors";
import { dispatcherFor, type ProxySpec } from "../net/proxy";

export const GRAPH = "https://graph.threads.net";
export const API = `${GRAPH}/v1.0`;

type Params = Record<string, string | number | boolean | undefined | null>;

function qs(p: Params) {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) if (v !== undefined && v !== null && v !== "") u.set(k, String(v));
  return u.toString();
}

export async function graphRequest<T>(
  method: "GET" | "POST" | "DELETE", url: string, params: Params, dispatcher?: Dispatcher,
): Promise<T> {
  const isGet = method === "GET" || method === "DELETE";
  const full = isGet ? `${url}?${qs(params)}` : url;
  let res;
  try {
    res = await fetch(full, {
      method,
      dispatcher,
      headers: isGet ? undefined : { "content-type": "application/x-www-form-urlencoded" },
      body: isGet ? undefined : qs(params),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (e) {
    throw new ThreadsApiError(`Network error: ${(e as Error).message}`, "transient");
  }
  const text = await res.text();
  let body: any = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
  if (!res.ok || body?.error) {
    const err = body?.error ?? {};
    const msg = err.error_user_msg || err.message || `HTTP ${res.status}`;
    throw new ThreadsApiError(msg, classify(res.status, err.code, msg), res.status, err.code, err.error_subcode);
  }
  return body as T;
}

/** Клієнт для одного акаунта: токен + (опційно) статична мережева конфігурація. */
export class ThreadsClient {
  private d: Dispatcher;
  constructor(private token: string, private userId: string, proxy?: ProxySpec | null) {
    this.d = dispatcherFor(proxy);
  }

  private get<T>(path: string, p: Params = {}) {
    return graphRequest<T>("GET", `${API}${path}`, { ...p, access_token: this.token }, this.d);
  }
  private post<T>(path: string, p: Params = {}) {
    return graphRequest<T>("POST", `${API}${path}`, { ...p, access_token: this.token }, this.d);
  }

  me() {
    return this.get<{ id: string; username: string; name?: string; threads_profile_picture_url?: string; threads_biography?: string }>(
      "/me", { fields: "id,username,name,threads_profile_picture_url,threads_biography" });
  }

  createContainer(p: {
    media_type: "TEXT" | "IMAGE" | "VIDEO" | "CAROUSEL"; text?: string; image_url?: string; video_url?: string;
    is_carousel_item?: boolean; children?: string[]; link_attachment?: string; topic_tag?: string;
  }) {
    return this.post<{ id: string }>(`/${this.userId}/threads`, {
      media_type: p.media_type, text: p.text, image_url: p.image_url, video_url: p.video_url,
      is_carousel_item: p.is_carousel_item, children: p.children?.join(","),
      link_attachment: p.link_attachment, topic_tag: p.topic_tag,
    });
  }

  containerStatus(id: string) {
    return this.get<{ id: string; status: "IN_PROGRESS" | "FINISHED" | "ERROR" | "EXPIRED" | "PUBLISHED"; error_message?: string }>(
      `/${id}`, { fields: "id,status,error_message" });
  }

  publish(creationId: string) {
    return this.post<{ id: string }>(`/${this.userId}/threads_publish`, { creation_id: creationId });
  }

  media(id: string) {
    return this.get<{ id: string; permalink?: string; timestamp?: string }>(`/${id}`, { fields: "id,permalink,timestamp" });
  }

  deleteMedia(id: string) {
    return graphRequest<{ success: boolean }>("DELETE", `${API}/${id}`, { access_token: this.token }, this.d);
  }

  publishingLimit() {
    return this.get<{ data: { quota_usage: number; config: { quota_total: number; quota_duration: number } }[] }>(
      `/${this.userId}/threads_publishing_limit`, { fields: "quota_usage,config" });
  }

  mediaInsights(mediaId: string) {
    return this.get<{ data: { name: string; values?: { value: number }[]; total_value?: { value: number } }[] }>(
      `/${mediaId}/insights`, { metric: "views,likes,replies,reposts,quotes,shares" });
  }

  userInsights(since: number, until: number) {
    return this.get<{ data: { name: string; values?: { value: number; end_time?: string }[]; total_value?: { value: number } }[] }>(
      `/${this.userId}/threads_insights`, { metric: "views,likes,replies,reposts,quotes,followers_count", since, until });
  }
}

export function metricValue(m: { values?: { value: number }[]; total_value?: { value: number } }): number {
  if (m.total_value) return m.total_value.value;
  return (m.values ?? []).reduce((s, v) => s + (v.value ?? 0), 0);
}
