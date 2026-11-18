import Link from "next/link";
import { serverDb } from "@/lib/supabase/server";
import { getSession, can } from "@/lib/auth";
import { PageHeader, Card, Empty } from "@/components/ui";
import { AccountTable } from "@/components/AccountTable";
import { createGroup, deleteGroup } from "@/app/actions/accounts";

export const dynamic = "force-dynamic";

export default async function Accounts({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const s = await getSession();
  const db = await serverDb();
  const [{ data: accounts }, { data: groups }, { data: members }, { data: stats }] = await Promise.all([
    db.from("accounts").select("*").order("username"),
    db.from("account_groups").select("*").order("kind").order("name"),
    db.from("account_group_members").select("*"),
    db.from("account_stats").select("*"),
  ]);
  const admin = can(s!.role, "admin");
  let list = accounts ?? [];
  if (sp.status) list = list.filter((a) => a.status === sp.status);
  if (sp.group) {
    const ids = new Set((members ?? []).filter((m) => m.group_id === sp.group).map((m) => m.account_id));
    list = list.filter((a) => ids.has(a.id));
  }
  if (sp.q) list = list.filter((a) => a.username.toLowerCase().includes(sp.q!.toLowerCase()));
  const kindLabel = { project: "Проєкти", country: "Країни", topic: "Тематика" } as const;

  return (
    <>
      <PageHeader title="Accounts" subtitle={`${accounts?.length ?? 0} підключених Threads-акаунтів`}
        actions={admin && <a href="/api/threads/connect" className="btn-primary">+ Підключити акаунт</a>} />

      {sp.connected && <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">Акаунт @{sp.connected} підключено.</div>}
      {sp.error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-800">Помилка підключення: {sp.error}</div>}

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <div className="card">
          <form className="flex flex-wrap gap-2 border-b border-line p-3">
            <input name="q" defaultValue={sp.q} placeholder="Пошук @username" className="input max-w-56" />
            <select name="status" defaultValue={sp.status ?? ""} className="input max-w-48">
              <option value="">Усі статуси</option>
              <option value="active">Активні</option><option value="paused">Призупинені</option>
              <option value="auth_error">Потрібна авторизація</option><option value="rate_limited">Ліміт</option><option value="disconnected">Відключені</option>
            </select>
            <select name="group" defaultValue={sp.group ?? ""} className="input max-w-48">
              <option value="">Усі групи</option>
              {groups?.map((g) => <option key={g.id} value={g.id}>{kindLabel[g.kind as keyof typeof kindLabel]}: {g.name}</option>)}
            </select>
            <button className="btn-ghost">Фільтр</button>
          </form>
          {list.length
            ? <AccountTable accounts={list} groups={groups ?? []} members={members ?? []} stats={stats ?? []} canAdmin={admin} />
            : <Empty title="Акаунтів не знайдено" text="Кожен акаунт підключається через офіційний OAuth Threads: увійдіть у потрібний акаунт Threads у браузері й натисніть «Підключити акаунт»." />}
        </div>

        <Card title="Групи">
          {(["project", "country", "topic"] as const).map((k) => (
            <div key={k} className="mb-4">
              <div className="mb-1.5 text-xs font-medium text-muted">{kindLabel[k]}</div>
              <div className="flex flex-wrap gap-1.5">
                {groups?.filter((g) => g.kind === k).map((g) => (
                  <span key={g.id} className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-0.5 text-xs">
                    <span className="h-2 w-2 rounded-full" style={{ background: g.color }} />
                    <Link href={`/accounts?group=${g.id}`}>{g.name}</Link>
                    {admin && <form action={deleteGroup.bind(null, g.id)}><button className="text-muted hover:text-red-600">×</button></form>}
                  </span>
                ))}
              </div>
            </div>
          ))}
          {can(s!.role, "editor") && (
            <form action={createGroup} className="space-y-2 border-t border-line pt-4">
              <input name="name" placeholder="Назва групи" className="input" required />
              <div className="flex gap-2">
                <select name="kind" className="input"><option value="project">Проєкт</option><option value="country">Країна</option><option value="topic">Тематика</option></select>
                <input name="color" type="color" defaultValue="#6366f1" className="h-9 w-12 rounded border border-line" />
              </div>
              <button className="btn-ghost w-full">Додати групу</button>
            </form>
          )}
        </Card>
      </div>
    </>
  );
}
