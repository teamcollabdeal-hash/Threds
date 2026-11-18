import { NextResponse } from "next/server";
import { adminDb } from "@/lib/supabase/admin";
import { getThreadsCreds } from "@/lib/threads/config";
import { log } from "@/lib/log";
import { parseSignedRequest, readSignedRequest } from "@/lib/threads/signed-request";

/** Uninstall Callback: користувач відкликав доступ застосунку у Threads. */
export async function POST(req: Request) {
  const creds = await getThreadsCreds();
  const data = creds ? parseSignedRequest(await readSignedRequest(req), creds.appSecret) : null;
  if (!data?.user_id) return NextResponse.json({ error: "invalid signed_request" }, { status: 400 });
  const db = adminDb();
  const { data: acc } = await db.from("accounts").select("id, username").eq("threads_user_id", String(data.user_id)).maybeSingle();
  if (acc) {
    await db.from("account_secrets").delete().eq("account_id", acc.id);
    await db.from("accounts").update({ status: "disconnected", status_reason: "Доступ відкликано у Threads" }).eq("id", acc.id);
    await db.from("publications").update({ status: "paused", error_message: "Акаунт відключено" })
      .eq("account_id", acc.id).in("status", ["scheduled", "queued"]);
    await log({ level: "warn", scope: "auth", message: `@${acc.username} відкликав доступ застосунку`, account_id: acc.id });
  }
  return NextResponse.json({ ok: true });
}
