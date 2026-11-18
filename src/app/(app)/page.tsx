import Link from "next/link";
import { serverDb } from "@/lib/supabase/server";
import { PageHeader, Stat, Card, Badge, Avatar, fmtDate, Empty } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const db = await serverDb();
  const [{ data: ov }, { data: accounts }, { data: stats }, { data: upcoming }, { data: errors }, { data: daily }] = await Promise.all([
    db.rpc("network_overview"),
    db.from("accounts").select("id, username, avatar_url, status, followers_count").order("username"),
    db.from("account_stats").select("*"),
    db.from("publications").select("id, scheduled_at, status, account:accounts(username), post:posts(text)")
      .in("status", ["scheduled", "queued", "publishing"]).order("scheduled_at").limit(8),
    db.from("logs").select("id, created_at, message, level").in("level", ["error", "warn"]).order("created_at", { ascending: false }).limit(6),
    db.from("publications").select("published_at").eq("status", "published")
      .gte("published_at", new Date(Date.now() - 14 * 86400_000).toISOString()),
  ]);
  const o = (ov ?? {}) as Record<string, number>;
  const byAcc = new Map((stats ?? []).map((s: any) => [s.account_id, s]));

  // публікації за 14 днів
  const days = [...Array(14)].map((_, i) => {
    const d = new Date(Date.now() - (13 - i) * 86400_000).toISOString().slice(0, 10);
    return { d, n: (daily ?? []).filter((p) => p.published_at?.slice(0, 10) === d).length };
  });
  const max = Math.max(1, ...days.map((x) => x.n));

  return (
    <>
      <PageHeader title="Dashboard" subtitle="Стан усієї мережі акаунтів"
        actions={<Link href="/posts/new" className="btn-primary">Новий пост</Link>} />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-6">
        <Stat label="Акаунтів" value={o.accounts_total ?? 0} hint={`${o.accounts_active ?? 0} активних`} />
        <Stat label="Проблемні" value={o.accounts_problem ?? 0} tone={o.accounts_problem ? "bad" : "default"} hint="авторизація / ліміти" />
        <Stat label="Опубліковано" value={o.published_total ?? 0} hint={`${o.published_24h ?? 0} за 24 год`} tone="good" />
        <Stat label="Заплановано" value={o.scheduled ?? 0} />
        <Stat label="Невдалі" value={o.failed ?? 0} tone={o.failed ? "bad" : "default"} />
        <Stat label="Перегляди" value={Number(o.views_total ?? 0).toLocaleString("uk-UA")} hint={`${Number(o.likes_total ?? 0).toLocaleString("uk-UA")} вподобань`} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card title="Публікації за 14 днів" className="lg:col-span-2">
          <div className="flex h-40 items-end gap-1.5">
            {days.map((x) => (
              <div key={x.d} className="group flex flex-1 flex-col items-center gap-1">
                <div className="text-[10px] text-muted opacity-0 group-hover:opacity-100">{x.n}</div>
                <div className="w-full rounded-t bg-accent/80" style={{ height: `${(x.n / max) * 120 + 2}px` }} />
                <div className="text-[10px] text-muted">{x.d.slice(8)}</div>
              </div>
            ))}
          </div>
        </Card>
        <Card title="Найближчі публікації" actions={<Link href="/scheduler" className="text-xs text-muted hover:text-ink">Календар →</Link>}>
          {upcoming?.length ? (
            <ul className="space-y-3">
              {upcoming.map((p: any) => (
                <li key={p.id} className="text-sm">
                  <div className="flex items-center justify-between"><span className="font-medium">@{p.account?.username}</span><span className="text-xs text-muted">{fmtDate(p.scheduled_at)}</span></div>
                  <div className="truncate text-xs text-muted">{p.post?.text || "(медіа)"}</div>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted">Немає запланованих публікацій</p>}
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card title="Акаунти" className="lg:col-span-2">
          {accounts?.length ? (
            <div className="-m-5 overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-line"><tr><th className="th">Акаунт</th><th className="th">Статус</th><th className="th text-right">Опубл.</th><th className="th text-right">Заплан.</th><th className="th text-right">Помилки</th><th className="th text-right">Підписники</th></tr></thead>
                <tbody className="divide-y divide-line">
                  {accounts.slice(0, 10).map((a) => {
                    const s: any = byAcc.get(a.id) ?? {};
                    return (
                      <tr key={a.id} className="hover:bg-canvas">
                        <td className="td"><Link href={`/accounts/${a.id}`} className="flex items-center gap-2"><Avatar url={a.avatar_url} name={a.username} size={24} />@{a.username}</Link></td>
                        <td className="td"><Badge status={a.status} /></td>
                        <td className="td text-right tabular-nums">{s.published ?? 0}</td>
                        <td className="td text-right tabular-nums">{s.scheduled ?? 0}</td>
                        <td className="td text-right tabular-nums">{s.failed ?? 0}</td>
                        <td className="td text-right tabular-nums">{a.followers_count ?? "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : <Empty title="Ще немає акаунтів" text="Підключіть перший Threads-акаунт через офіційну авторизацію Meta." action={<Link href="/accounts" className="btn-primary">Підключити</Link>} />}
        </Card>
        <Card title="Останні попередження" actions={<Link href="/logs" className="text-xs text-muted hover:text-ink">Логи →</Link>}>
          {errors?.length ? (
            <ul className="space-y-3">
              {errors.map((l) => (
                <li key={l.id} className="text-sm"><div className="flex items-center gap-2"><Badge status={l.level} /><span className="text-xs text-muted">{fmtDate(l.created_at)}</span></div><div className="mt-1 text-xs">{l.message}</div></li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted">Все спокійно</p>}
        </Card>
      </div>
    </>
  );
}
