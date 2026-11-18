import { serverDb } from "@/lib/supabase/server";
import { getSession, can } from "@/lib/auth";
import { PageHeader, Card, Badge } from "@/components/ui";
import { saveDefaults } from "@/app/actions/settings";
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
  const admin = can(s!.role, "admin");

  return (
    <>
      <PageHeader title="Settings" subtitle="Налаштування сервісу, доступи та можливості API" />
      <div className="grid gap-6 lg:grid-cols-2">
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
          <p className="mt-6 text-xs text-muted">Ролі: owner — усе; admin — акаунти, мережа, налаштування; editor — контент і розклад; viewer — лише перегляд.</p>
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
