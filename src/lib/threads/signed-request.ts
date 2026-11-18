import { createHmac, timingSafeEqual } from "node:crypto";

/** Розбір signed_request від Meta (uninstall / data deletion callbacks). Повертає payload або null. */
export function parseSignedRequest(signed: string | null, secret: string): { user_id?: string; [k: string]: unknown } | null {
  if (!signed || !signed.includes(".")) return null;
  const [sig, payload] = signed.split(".", 2);
  const expected = createHmac("sha256", secret).update(payload).digest();
  const given = Buffer.from(sig.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (data.algorithm && String(data.algorithm).toUpperCase() !== "HMAC-SHA256") return null;
    return data;
  } catch { return null; }
}

export async function readSignedRequest(req: Request): Promise<string | null> {
  const ct = req.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) return ((await req.json().catch(() => ({}))) as { signed_request?: string }).signed_request ?? null;
  const form = await req.formData().catch(() => null);
  return (form?.get("signed_request") as string | null) ?? null;
}
