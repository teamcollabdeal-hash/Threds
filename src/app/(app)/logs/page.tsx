import Link from "next/link";
import { serverDb } from "@/lib/supabase/server";
import { PageHeader, Badge, Empty, fmtDate } from "@/components/ui";

export const dynamic = "force-dynamic";
const PAGE = 100;

export default async function Logs({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1));
  const db = await serverDb();
  let q = db.from("logs").select("*, account:accounts(username)", { count: "exact" }).order("created_at", { ascending: false }).range((page - 1) * PAGE, page * PAGE - 1);
  if (sp.level) q = q.eq("level", sp.level);
  if (sp.scope) q = q.eq("scope", sp.scope);
  if (sp.account) q = q.eq("account_id", sp.account);
  if (sp.q) q = q.ilike("message", `%${sp.q}%`);
  const [{ data, count }, { data: accounts }] = await Promise.all([q, db.from("accounts").select("id, username").order("username")]);
  const qs = (p: number) => `?${new URLSearchParams({ ...(sp as Record<string, string>), page: String(p) })}`;

  return (
    <>
      <PageHeader title="Logs" subtitle={`Журнал операцій · ${count ?? 0} записів`} />
      <div className="card">
        <form className="flex flex-wrap gap-2 border-b border-line p-3">
          <input name="q" defaultValue={sp.q} placeholder="Пошук у повідомленнях" className="input max-w-64" />
          <select name="level" defaultValue={sp.level ?? ""} className="input max-w-36"><option value="">Рівень</option>{["error", "warn", "info", "debug"].map((l) => <option key={l}>{l}</option>)}</select>
          <select name="scope" defaultValue={sp.scope ?? ""} className="input max-w-40"><option value="">Модуль</option>{["publish", "auth", "token", "scheduler", "insights", "network", "user"].map((l) => <option key={l}>{l}</option>)}</select>
          <select name="account" defaultValue={sp.account ?? ""} className="input max-w-52"><option value="">Акаунт</option>{accounts?.map((a) => <option key={a.id} value={a.id}>@{a.username}</option>)}</select>
          <button className="btn-ghost">Фільтр</button>
        </form>
        {data?.length ? (
          <table className="w-full">
            <thead className="border-b border-line"><tr><th className="th w-36">Час</th><th className="th w-20">Рівень</th><th className="th w-24">Модуль</th><th className="th">Повідомлення</th><th className="th w-40">Акаунт</th></tr></thead>
            <tbody className="divide-y divide-line font-mono text-xs">{data.map((l: any) => (
              <tr key={l.id} className="align-top">
                <td className="td text-xs text-muted">{fmtDate(l.created_at)}</td>
                <td className="td"><Badge status={l.level} /></td>
                <td className="td text-xs">{l.scope}</td>
                <td className="td text-xs">{l.message}{Object.keys(l.meta ?? {}).length > 0 && <details className="mt-1"><summary className="cursor-pointer text-muted">meta</summary><pre className="mt-1 whitespace-pre-wrap text-[11px] text-muted">{JSON.stringify(l.meta, null, 2)}</pre></details>}</td>
                <td className="td text-xs">{l.account?.username ? `@${l.account.username}` : "—"}</td>
              </tr>
            ))}</tbody>
          </table>
        ) : <Empty title="Записів немає" />}
        <div className="flex justify-end gap-2 border-t border-line px-4 py-3">
          {page > 1 && <Link className="btn-ghost py-1" href={qs(page - 1)}>←</Link>}
          {(count ?? 0) > page * PAGE && <Link className="btn-ghost py-1" href={qs(page + 1)}>→</Link>}
        </div>
      </div>
    </>
  );
}
