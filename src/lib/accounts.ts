import { adminDb } from "./supabase/admin";
import { decrypt } from "./crypto";
import { ThreadsClient } from "./threads/client";
import type { ProxySpec } from "./net/proxy";

export async function loadProxy(networkConfigId: string | null): Promise<ProxySpec | null> {
  if (!networkConfigId) return null;
  const db = adminDb();
  const { data: cfg } = await db.from("network_configs").select("*").eq("id", networkConfigId).single();
  if (!cfg) return null;
  const { data: sec } = await db.from("network_secrets").select("password_enc").eq("network_config_id", cfg.id).maybeSingle();
  return {
    protocol: cfg.protocol, host: cfg.host, port: cfg.port, username: cfg.username,
    password: sec?.password_enc ? decrypt(sec.password_enc) : null,
  };
}

export async function loadAccountToken(accountId: string): Promise<string | null> {
  const { data } = await adminDb().from("account_secrets").select("access_token_enc").eq("account_id", accountId).maybeSingle();
  return data?.access_token_enc ? decrypt(data.access_token_enc) : null;
}

export async function clientForAccount(acc: { id: string; threads_user_id: string; network_config_id: string | null }) {
  const token = await loadAccountToken(acc.id);
  if (!token) throw new Error("Токен акаунта відсутній — підключіть акаунт повторно");
  return new ThreadsClient(token, acc.threads_user_id, await loadProxy(acc.network_config_id));
}
