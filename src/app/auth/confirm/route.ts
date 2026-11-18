import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { serverDb } from "@/lib/supabase/server";

/** Посилання з листа підтвердження Supabase: ?code=… (PKCE) або ?token_hash=…&type=… */
export async function GET(req: NextRequest) {
  const u = req.nextUrl;
  const db = await serverDb();
  const code = u.searchParams.get("code");
  const tokenHash = u.searchParams.get("token_hash");
  const type = u.searchParams.get("type") as EmailOtpType | null;
  const { error } = code
    ? await db.auth.exchangeCodeForSession(code)
    : tokenHash && type
      ? await db.auth.verifyOtp({ token_hash: tokenHash, type })
      : { error: new Error("missing token") };
  return NextResponse.redirect(new URL(error ? "/login?error=confirm" : "/", u.origin));
}
