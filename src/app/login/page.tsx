"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { browserDb } from "@/lib/supabase/client";
import { AtSign } from "lucide-react";

export default function Login() {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setMsg(null);
    const db = browserDb();
    const { error, data } = mode === "in"
      ? await db.auth.signInWithPassword({ email, password })
      : await db.auth.signUp({ email, password });
    setBusy(false);
    if (error) return setMsg(error.message);
    if (mode === "up" && !data.session) return setMsg("Перевірте пошту для підтвердження реєстрації.");
    router.replace("/"); router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form onSubmit={submit} className="card w-full max-w-sm p-7">
        <div className="mb-6 flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand text-white"><AtSign size={18} /></div>
          <div><div className="font-semibold">MultiThreads</div><div className="text-xs text-muted">Адміністративна панель</div></div>
        </div>
        <label className="label">Email</label>
        <input className="input mb-3" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <label className="label">Пароль</label>
        <input className="input mb-4" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
        {msg && <p className="mb-3 text-sm text-red-600">{msg}</p>}
        <button className="btn-primary w-full" disabled={busy}>{mode === "in" ? "Увійти" : "Створити акаунт"}</button>
        <button type="button" className="mt-3 w-full text-xs text-muted hover:text-ink" onClick={() => setMode(mode === "in" ? "up" : "in")}>
          {mode === "in" ? "Немає акаунта? Зареєструватися" : "Вже є акаунт? Увійти"}
        </button>
        <p className="mt-4 text-[11px] leading-relaxed text-muted">Перший зареєстрований користувач отримує роль owner. Наступні — viewer, доки owner не змінить роль у Settings.</p>
      </form>
    </div>
  );
}
