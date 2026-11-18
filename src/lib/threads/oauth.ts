import { graphRequest, GRAPH } from "./client";
import { env } from "../env";

export const redirectUri = () => `${env.appUrl}/api/threads/callback`;

export function authorizeUrl(state: string) {
  const u = new URL("https://threads.net/oauth/authorize");
  u.searchParams.set("client_id", env.threadsAppId);
  u.searchParams.set("redirect_uri", redirectUri());
  u.searchParams.set("scope", env.threadsScopes);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("state", state);
  return u.toString();
}

export function exchangeCode(code: string) {
  return graphRequest<{ access_token: string; user_id: string | number }>("POST", `${GRAPH}/oauth/access_token`, {
    client_id: env.threadsAppId, client_secret: env.threadsAppSecret,
    grant_type: "authorization_code", redirect_uri: redirectUri(), code,
  });
}

export function toLongLived(shortToken: string) {
  return graphRequest<{ access_token: string; expires_in: number }>("GET", `${GRAPH}/access_token`, {
    grant_type: "th_exchange_token", client_secret: env.threadsAppSecret, access_token: shortToken,
  });
}

/** Токен має бути ≥24 год і не протермінований. Продовжує дію на 60 днів. */
export function refreshLongLived(token: string) {
  return graphRequest<{ access_token: string; expires_in: number }>("GET", `${GRAPH}/refresh_access_token`, {
    grant_type: "th_refresh_token", access_token: token,
  });
}
