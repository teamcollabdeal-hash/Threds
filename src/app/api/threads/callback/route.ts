import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { exchangeCode, toLongLived } from "@/lib/threads/oauth";
import { ThreadsClient } from "@/lib/threads/client";
import { adminDb } from "@/lib/supabase/admin";
import { encrypt } from "@/lib/crypto";
import { log } from "@/lib/log";
import { env } from "@/lib/env";

export async function GET(req: NextRequest) {
  const back = (q: string) => NextResponse.redirect(`${env.appUrl}/accounts?${q}`);
  const url = req.nextUrl;
  const err = url.searchParams.get("error_description") || url.searchParams.get("error");
  if (err) return back(`error=${encodeURIComponent(err)}`);

  const session = await getSession();
  if (!session || !["owner", "admin"].includes(session.role)) return back("error=forbidden");
  const state = url.searchParams.get("state");
  if (!state || state !== req.cookies.get("mt_oauth_state")?.value) return back("error=invalid_state");
  const code = url.searchParams.get("code");
  if (!code) return back("error=no_code");

  try {
    const short = await exchangeCode(code.replace(/#_$/, ""));
    const long = await toLongLived(short.access_token);
    const me = await new ThreadsClient(long.access_token, String(short.user_id)).me();
    const db = adminDb();
    const now = new Date();
    const { data: acc, error } = await db.from("accounts").upsert({
      threads_user_id: me.id, username: me.username, display_name: me.name ?? null,
      avatar_url: me.threads_profile_picture_url ?? null, biography: me.threads_biography ?? null,
      status: "active", status_reason: null, scopes: env.threadsScopes.split(","),
      token_expires_at: new Date(now.getTime() + long.expires_in * 1000).toISOString(),
      token_refreshed_at: now.toISOString(), connected_by: session.user.id,
    }, { onConflict: "threads_user_id" }).select("id").single();
    if (error || !acc) throw new Error(error?.message ?? "upsert failed");
    await db.from("account_secrets").upsert({ account_id: acc.id, access_token_enc: encrypt(long.access_token), updated_at: now.toISOString() });
    // відновлюємо публікації, призупинені через помилку авторизації
    await db.from("publications").update({ status: "scheduled", error_message: null })
      .eq("account_id", acc.id).eq("status", "paused");
    await log({ scope: "auth", message: `Підключено акаунт @${me.username}`, account_id: acc.id, actor_id: session.user.id });
    const res = back(`connected=${encodeURIComponent(me.username)}`);
    res.cookies.delete("mt_oauth_state");
    return res;
  } catch (e) {
    await log({ level: "error", scope: "auth", message: `OAuth помилка: ${(e as Error).message}`, actor_id: session.user.id });
    return back(`error=${encodeURIComponent((e as Error).message)}`);
  }
}
