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
  const res = NextResponse.redirect(authorizeUrl(state));
  res.cookies.set("mt_oauth_state", state, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 600, path: "/" });
  return res;
}
