import { graphRequest, GRAPH } from "./client";
import { env } from "../env";
import { requireThreadsCreds } from "./config";

export const redirectUri = () => `${env.appUrl}/api/threads/callback`;

export async function authorizeUrl(state: string) {
  const { appId } = await requireThreadsCreds();
  const u = new URL("https://threads.net/oauth/authorize");
  u.searchParams.set("client_id", appId);
  u.searchParams.set("redirect_uri", redirectUri());
  u.searchParams.set("scope", env.threadsScopes);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("state", state);
  return u.toString();
}

export async function exchangeCode(code: string) {
  const { appId, appSecret } = await requireThreadsCreds();
  return graphRequest<{ access_token: string; user_id: string | number }>("POST", `${GRAPH}/oauth/access_token`, {
    client_id: appId, client_secret: appSecret,
    grant_type: "authorization_code", redirect_uri: redirectUri(), code,
  });
}

export async function toLongLived(shortToken: string) {
  const { appSecret } = await requireThreadsCreds();
  return graphRequest<{ access_token: string; expires_in: number }>("GET", `${GRAPH}/access_token`, {
    grant_type: "th_exchange_token", client_secret: appSecret, access_token: shortToken,
  });
}

/** Токен має бути ≥24 год і не протермінований. Продовжує дію на 60 днів. */
export function refreshLongLived(token: string) {
  return graphRequest<{ access_token: string; expires_in: number }>("GET", `${GRAPH}/refresh_access_token`, {
    grant_type: "th_refresh_token", access_token: token,
  });
}
