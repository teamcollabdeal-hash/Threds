import { serverDb } from "@/lib/supabase/server";
import { getSession, can } from "@/lib/auth";
import { PageHeader, Card, Badge } from "@/components/ui";
import { saveDefaults, saveThreadsApi } from "@/app/actions/settings";
import { getThreadsCreds } from "@/lib/threads/config";
import { env } from "@/lib/env";
import { CAPABILITIES, LIMITS } from "@/lib/threads/capabilities";
import { RoleSelect } from "@/components/RoleSelect";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const s = await getSession();
  const db = await serverDb();
  const [{ data: def }, { data: users }] = await Promise.all([
    db.from("app_settings").select("value").eq("key", "defaults").maybeSingle(),
    db.from("profiles").select("*").order("created_at"),
  ]);
  const d = (def?.value ?? {}) as Record<string, any>;
  const creds = await getThreadsCreds();
  const owner = s!.role === "owner";
  const base = env.appUrl;
  const urls = [
    ["Redirect Callback URL", `${base}/api/threads/callback`],
    ["Uninstall Callback URL", `${base}/api/threads/deauthorize`],
    ["Delete Callback URL", `${base}/api/threads/delete`],
    ["Privacy Policy URL", `${base}/privacy`],
  ];
  const admin = can(s!.role, "admin");

  return (
    <>
      <PageHeader title="Settings" subtitle="Налаштування сервісу, доступи та можливості API" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Threads API" className="lg:col-span-2">
          <div className="grid gap-6 md:grid-cols-2">
            <form action={saveThreadsApi} className="space-y-3">
              <fieldset disabled={!owner} className="space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  <Badge status={creds ? "ok" : "failed"}>{creds ? "Підключено" : "Не налаштовано"}</Badge>
                  {creds && <span className="text-xs text-muted">App ID {creds.appId}{creds.source === "env" ? " · зі змінних Vercel" : ""}</span>}
                </div>
                <div><label className="label">Threads App ID</label><input name="app_id" required inputMode="numeric" defaultValue={creds?.appId ?? ""} className="input" placeholder="123456789012345" /></div>
                <div><label className="label">Threads App Secret</label><input name="app_secret" type="password" autoComplete="off" required={!creds} className="input" placeholder={creds ? "•••••••• (залиште порожнім, щоб не змінювати)" : "32 символи"} /></div>
                <button className="btn-primary">Зберегти ключі</button>
                {!owner && <p className="text-xs text-muted">Змінювати ключі може лише owner.</p>}
                <p className="text-xs text-muted">Ключі шифруються (AES-256-GCM) і не повертаються в браузер.</p>
              </fieldset>
            </form>
            <div className="text-sm">
              <div className="mb-2 font-medium">Що вписати в Meta for Developers</div>
              <div className="space-y-2">{urls.map(([k, v]) => (
                <div key={k}><div className="text-xs text-muted">{k}</div><code className="block select-all break-all rounded bg-black/5 px-2 py-1 text-xs">{v}</code></div>
              ))}</div>
              <ol className="mt-3 list-decimal space-y-1 pl-4 text-xs text-muted">
                <li>developers.facebook.com → Create App → use case «Access the Threads API».</li>
                <li>Use cases → Customize → Settings: вставте 4 адреси вище. Permissions: додайте threads_content_publish, threads_manage_insights, threads_read_replies, threads_manage_replies.</li>
                <li>App roles → Roles → Threads Testers: додайте свої акаунти, прийміть запрошення в Threads (Налаштування → Акаунт → Website permissions).</li>
                <li>Скопіюйте Threads App ID і Threads App Secret (Use cases → Settings) у форму ліворуч.</li>
              </ol>
            </div>
          </div>
        </Card>

        <Card title="Значення за замовчуванням">
          <form action={saveDefaults} className="space-y-3">
            <fieldset disabled={!admin} className="space-y-3">
              <div><label className="label">Часовий пояс</label><input name="timezone" defaultValue={d.timezone ?? "Europe/Kyiv"} className="input" /></div>
              <div className="grid grid-cols-3 gap-2">
                <div><label className="label">Ліміт / 24 год</label><input name="daily_limit" type="number" max={250} defaultValue={d.daily_limit ?? 50} className="input" /></div>
                <div><label className="label">Інтервал, хв</label><input name="min_interval_minutes" type="number" defaultValue={d.min_interval_minutes ?? 10} className="input" /></div>
                <div><label className="label">Макс. спроб</label><input name="max_attempts" type="number" min={1} max={10} defaultValue={d.max_attempts ?? 5} className="input" /></div>
              </div>
              <button className="btn-primary">Зберегти</button>
            </fieldset>
          </form>
        </Card>

        <Card title="Користувачі панелі">
          <table className="-m-5 w-[calc(100%+2.5rem)]">
            <tbody className="divide-y divide-line">{(users ?? []).map((u) => (
              <tr key={u.id}><td className="td">{u.email}</td><td className="td text-right">
                {s!.role === "owner" && u.id !== s!.user.id && u.role !== "owner" ? <RoleSelect userId={u.id} role={u.role} /> : <Badge status="draft">{u.role}</Badge>}
              </td></tr>
            ))}</tbody>
          </table>
          <p className="mt-6 text-xs text-muted">Ролі: owner — усе; admin — акаунти, мережа, налаштування; editor — контент і розклад; viewer — лише перегляд; «без доступу» — нові користувачі до схвалення owner’ом.</p>
        </Card>

        <Card title="Можливості Threads API" className="lg:col-span-2">
          <div className="grid gap-x-8 gap-y-2 md:grid-cols-2">
            {CAPABILITIES.map((c) => (
              <div key={c.key} className="flex items-start gap-3 py-1.5 text-sm">
                <Badge status={c.supported ? "ok" : "draft"}>{c.supported ? "Доступно" : "Немає в API"}</Badge>
                <div><div className="font-medium">{c.label}</div><div className="text-xs text-muted">{c.note}</div></div>
              </div>
            ))}
          </div>
          <div className="mt-4 border-t border-line pt-4 text-xs text-muted">
            Ліміти: {LIMITS.postsPer24h} постів і {LIMITS.repliesPer24h} відповідей на профіль за 24 год · текст ≤{LIMITS.textMax} · ≤{LIMITS.maxLinks} посилань · карусель {LIMITS.carouselMin}–{LIMITS.carouselMax} · токен {LIMITS.tokenTtlDays} днів (автопродовження).
          </div>
        </Card>
      </div>
    </>
  );
}
