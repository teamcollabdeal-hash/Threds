export type Role = "owner" | "admin" | "editor" | "viewer" | "pending";
export type AccountStatus = "active" | "paused" | "auth_error" | "rate_limited" | "disconnected";
export type PublicationStatus =
  | "draft" | "scheduled" | "queued" | "publishing" | "published" | "failed" | "cancelled" | "paused";
export type MediaItem = { url: string; kind: "image" | "video"; asset_id?: string };

export interface Account {
  id: string; threads_user_id: string; username: string; display_name: string | null;
  avatar_url: string | null; biography: string | null; status: AccountStatus; status_reason: string | null;
  token_expires_at: string | null; token_refreshed_at: string | null; scopes: string[];
  network_config_id: string | null; timezone: string; daily_limit: number; min_interval_minutes: number;
  settings: Record<string, unknown>; notes: string | null; followers_count: number | null;
  connected_at: string; updated_at: string;
}

export interface Post {
  id: string; campaign_id: string | null; text: string; media: MediaItem[];
  link_attachment: string | null; topic_tag: string | null; source: string; created_at: string;
}

export interface Publication {
  id: string; post_id: string; account_id: string; schedule_id: string | null; scheduled_at: string;
  status: PublicationStatus; attempts: number; next_attempt_at: string | null; container_id: string | null;
  threads_media_id: string | null; permalink: string | null; error_code: string | null;
  error_message: string | null; published_at: string | null; created_at: string;
}

export interface NetworkConfig {
  id: string; name: string; protocol: "http" | "https" | "socks5"; host: string; port: number;
  username: string | null; status: "unknown" | "ok" | "error"; last_checked_at: string | null;
  last_latency_ms: number | null; last_error: string | null;
}
