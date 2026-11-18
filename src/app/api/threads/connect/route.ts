import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { requireRole } from "@/lib/auth";
import { authorizeUrl } from "@/lib/threads/oauth";

/** Старт OAuth. Користувач має бути залогінений у Threads під тим акаунтом, який підключає. */
export async function GET() {
  try { await requireRole("admin"); } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 });
  }
  const state = randomBytes(24).toString("base64url");
  let url: string;
  try { url = await authorizeUrl(state); } catch (e) {
    return NextResponse.redirect(new URL(`/accounts?error=${encodeURIComponent((e as Error).message)}`, process.env.APP_URL ?? "http://localhost:3000"));
  }
  const res = NextResponse.redirect(url);
  res.cookies.set("mt_oauth_state", state, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 600, path: "/" });
  return res;
}
