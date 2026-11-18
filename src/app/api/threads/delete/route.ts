import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { adminDb } from "@/lib/supabase/admin";
import { env } from "@/lib/env";
import { getThreadsCreds } from "@/lib/threads/config";
import { log } from "@/lib/log";
import { parseSignedRequest, readSignedRequest } from "@/lib/threads/signed-request";

/** Data Deletion Callback: видаляємо акаунт і всі пов'язані дані (каскадом). */
export async function POST(req: Request) {
  const creds = await getThreadsCreds();
  const data = creds ? parseSignedRequest(await readSignedRequest(req), creds.appSecret) : null;
  if (!data?.user_id) return NextResponse.json({ error: "invalid signed_request" }, { status: 400 });
  const code = randomBytes(8).toString("hex");
  const db = adminDb();
  const { data: acc } = await db.from("accounts").select("id, username").eq("threads_user_id", String(data.user_id)).maybeSingle();
  if (acc) {
    await db.from("accounts").delete().eq("id", acc.id);
    await log({ level: "warn", scope: "auth", message: `Дані @${acc.username} видалено на запит користувача`, meta: { confirmation_code: code } });
  }
  return NextResponse.json({ url: `${env.appUrl}/privacy?deletion=${code}`, confirmation_code: code });
}
