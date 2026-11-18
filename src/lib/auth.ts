import { cache } from "react";
import { redirect } from "next/navigation";
import { serverDb } from "./supabase/server";
import type { Role } from "./types";

const rank: Record<Role, number> = { pending: 0, viewer: 1, editor: 2, admin: 3, owner: 4 };

/** Один раз на запит (cache). JWT перевіряється локально через getClaims — без зайвого запиту до Auth. */
export const getSession = cache(async () => {
  const db = await serverDb();
  const { data } = await db.auth.getClaims();
  const c = data?.claims;
  if (!c?.sub) return null;
  const user = { id: c.sub as string, email: (c.email as string | undefined) ?? null };
  const { data: profile } = await db.from("profiles").select("role, full_name, email").eq("id", user.id).single();
  return { user, role: (profile?.role ?? "pending") as Role, profile };
});

export async function requireUser() {
  const s = await getSession();
  if (!s) redirect("/login");
  if (s.role === "pending") redirect("/pending");
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
