import { adminDb } from "./supabase/admin";

type Level = "debug" | "info" | "warn" | "error";
export interface LogInput {
  level?: Level; scope: string; message: string;
  account_id?: string | null; publication_id?: string | null; actor_id?: string | null;
  meta?: Record<string, unknown>;
}

/** Пише в таблицю logs і в stdout. Ніколи не кидає. */
export async function log(entry: LogInput) {
  const row = { level: entry.level ?? "info", meta: {}, ...entry };
  const line = `[${row.level}] ${row.scope}: ${row.message}`;
  (row.level === "error" ? console.error : console.log)(line);
  try { await adminDb().from("logs").insert(row); } catch (e) { console.error("log insert failed", e); }
}
