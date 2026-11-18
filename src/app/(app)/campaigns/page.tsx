import Link from "next/link";
import { serverDb } from "@/lib/supabase/server";
import { getSession, can } from "@/lib/auth";
import { PageHeader, Card, Badge, Empty, fmtDate } from "@/components/ui";
import { createCampaign, setCampaignStatus } from "@/app/actions/campaigns";

export const dynamic = "force-dynamic";

export default async function Campaigns() {
  const s = await getSession();
  const db = await serverDb();
  const [{ data: campaigns }, { data: pubs }] = await Promise.all([
    db.from("campaigns").select("*").order("created_at", { ascending: false }),
    db.from("publications").select("status, account_id, post:posts!inner(campaign_id)").not("post.campaign_id", "is", null).limit(20000),
  ]);
  const agg = new Map<string, { total: number; published: number; failed: number; scheduled: number; accounts: Set<string> }>();
  for (const p of (pubs ?? []) as any[]) {
    const id = p.post.campaign_id;
    const a = agg.get(id) ?? { total: 0, published: 0, failed: 0, scheduled: 0, accounts: new Set() };
    a.total++; a.accounts.add(p.account_id);
    if (p.status === "published") a.published++; else if (p.status === "failed") a.failed++; else if (["scheduled", "queued"].includes(p.status)) a.scheduled++;
    agg.set(id, a);
  }
  const editor = can(s!.role, "editor");

  return (
    <>
      <PageHeader title="Campaigns" subtitle="Групи публікацій з загальним керуванням" actions={<Link href="/bulk" className="btn-ghost">Імпорт кампанії з CSV</Link>} />
      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="card">
          {campaigns?.length ? (
            <table className="w-full">
              <thead className="border-b border-line"><tr><th className="th">Кампанія</th><th className="th">Статус</th><th className="th">Прогрес</th><th className="th text-right">Акаунтів</th><th className="th" /></tr></thead>
              <tbody className="divide-y divide-line">{campaigns.map((c) => {
                const a = agg.get(c.id); const pct = a?.total ? Math.round((a.published / a.total) * 100) : 0;
                return (
                  <tr key={c.id}>
                    <td className="td"><div className="font-medium">{c.name}</div><div className="text-xs text-muted">{c.description} {c.starts_at && `· ${fmtDate(c.starts_at)} – ${fmtDate(c.ends_at)}`}</div></td>
                    <td className="td"><Badge status={c.status} /></td>
                    <td className="td w-56">
                      <div className="h-1.5 overflow-hidden rounded-full bg-canvas"><div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} /></div>
                      <div className="mt-1 text-xs text-muted">{a?.published ?? 0}/{a?.total ?? 0} опубл. · {a?.scheduled ?? 0} в плані · {a?.failed ?? 0} помилок</div>
                    </td>
                    <td className="td text-right">{a?.accounts.size ?? 0}</td>
                    <td className="td whitespace-nowrap text-right">{editor && (
                      c.status === "active"
                        ? <form action={setCampaignStatus.bind(null, c.id, "paused")}><button className="btn-ghost py-1 text-xs">Пауза</button></form>
                        : c.status !== "completed" && <form action={setCampaignStatus.bind(null, c.id, "active")}><button className="btn-ghost py-1 text-xs">Запустити</button></form>
                    )}</td>
                  </tr>
                );
              })}</tbody>
            </table>
          ) : <Empty title="Кампаній ще немає" text="Створіть кампанію праворуч або імпортуйте CSV з назвою кампанії." />}
        </div>
        {editor && (
          <Card title="Нова кампанія">
            <form action={createCampaign} className="space-y-3">
              <div><label className="label">Назва</label><input name="name" required className="input" /></div>
              <div><label className="label">Опис</label><textarea name="description" rows={2} className="input" /></div>
              <div><label className="label">Початок</label><input name="starts_at" type="date" className="input" /></div>
              <div><label className="label">Кінець</label><input name="ends_at" type="date" className="input" /></div>
              <button className="btn-primary w-full">Створити</button>
            </form>
          </Card>
        )}
      </div>
    </>
  );
}
