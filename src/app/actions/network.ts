"use server";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { adminDb } from "@/lib/supabase/admin";
import { encrypt } from "@/lib/crypto";
import { checkNetwork } from "@/lib/maintenance";
import { log } from "@/lib/log";

export async function saveNetworkConfig(form: FormData) {
  const s = await requireRole("admin");
  const id = (form.get("id") as string) || null;
  const row = {
    name: String(form.get("name")), protocol: String(form.get("protocol")), host: String(form.get("host")).trim(),
    port: Number(form.get("port")), username: (form.get("username") as string) || null, status: "unknown",
  };
  if (!row.name || !row.host || !row.port) throw new Error("Заповніть назву, хост і порт");
  const db = adminDb();
  const { data } = id
    ? await db.from("network_configs").update(row).eq("id", id).select("id").single()
    : await db.from("network_configs").insert(row).select("id").single();
  const password = form.get("password") as string;
  if (data && password) await db.from("network_secrets").upsert({ network_config_id: data.id, password_enc: encrypt(password) });
  await log({ scope: "network", message: `Збережено мережеву конфігурацію "${row.name}"`, actor_id: s.user.id });
  revalidatePath("/network");
}

export async function deleteNetworkConfig(id: string) {
  await requireRole("admin");
  await adminDb().from("network_configs").delete().eq("id", id);
  revalidatePath("/network");
}

export async function testNetworkConfig(id: string) {
  await requireRole("admin");
  const r = await checkNetwork(id);
  revalidatePath("/network");
  return r;
}

export async function assignNetwork(accountIds: string[], configId: string | null) {
  await requireRole("admin");
  await adminDb().from("accounts").update({ network_config_id: configId }).in("id", accountIds);
  revalidatePath("/network"); revalidatePath("/accounts");
}
