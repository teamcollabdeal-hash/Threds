import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { env } from "../env";

async function realDb() {
  const store = await cookies();
  return createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try { list.forEach(({ name, value, options }) => store.set(name, value, options)); } catch { /* RSC */ }
      },
    },
  });
}

export async function serverDb(): ReturnType<typeof realDb> {
  if (process.env.DEMO_MODE === "1") return (await import("./demo")).demoDb();
  return realDb();
}
