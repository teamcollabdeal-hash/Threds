import { redirect } from "next/navigation";
import { serverDb } from "./supabase/server";
import type { Role } from "./types";

const rank: Record<Role, number> = { viewer: 1, editor: 2, admin: 3, owner: 4 };

export async function getSession() {
  const db = await serverDb();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return null;
  const { data: profile } = await db.from("profiles").select("role, full_name, email").eq("id", user.id).single();
  return { user, role: (profile?.role ?? "viewer") as Role, profile };
}

export async function requireUser() {
  const s = await getSession();
  if (!s) redirect("/login");
  return s;
}

/** Для server actions / route handlers: кидає помилку, якщо роль недостатня. */
export async function requireRole(min: Role) {
  const s = await getSession();
  if (!s) throw new Error("Unauthorized");
  if (rank[s.role] < rank[min]) throw new Error(`Forbidden: потрібна роль ${min}`);
  return s;
}

export function can(role: Role, min: Role) { return rank[role] >= rank[min]; }
