import Link from "next/link";
import clsx from "clsx";
import { serverDb } from "@/lib/supabase/server";
import { PageHeader, Card, Badge, fmtDate } from "@/components/ui";
import { toggleSchedule } from "@/app/actions/posts";
import { zonedParts } from "@/lib/tz";

export const dynamic = "force-dynamic";
const TZ = "Europe/Kyiv";
const WD = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"];
const dot: Record<string, string> = { published: "bg-emerald-500", failed: "bg-red-500", scheduled: "bg-indigo-500", queued: "bg-sky-500", publishing: "bg-sky-500", paused: "bg-amber-500", draft: "bg-gray-400" };

export default async function Scheduler({ searchParams }: { searchParams: Promise<{ m?: string; d?: string }> }) {
  const sp = await searchParams;
  const now = zonedParts(new Date(), TZ);
  const [y, m] = (sp.m ?? `${now.y}-${String(now.m).padStart(2, "0")}`).split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const daysIn = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = (first.getUTCDay() + 6) % 7;
  const from = new Date(Date.UTC(y, m - 1, 1) - 86400_000).toISOString();
  const to = new Date(Date.UTC(y, m, 1) + 86400_000).toISOString();

  const db = await serverDb();
  const [{ data: pubs }, { data: schedules }] = await Promise.all([
    db.from("publications").select("id, status, scheduled_at, account:accounts(username), post:posts(text)")
      .gte("scheduled_at", from).lt("scheduled_at", to).neq("status", "cancelled").order("scheduled_at").limit(5000),
    db.from("schedules").select("*, post:posts(text)").order("created_at", { ascending: false }),
  ]);
  const byDay = new Map<string, any[]>();
  for (const p of pubs ?? []) {
    const z = zonedParts(new Date(p.scheduled_at), TZ);
    if (z.m !== m) continue;
    const k = String(z.d);
    byDay.set(k, [...(byDay.get(k) ?? []), p]);
  }
  const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  const monthName = first.toLocaleString("uk-UA", { month: "long", year: "numeric", timeZone: "UTC" });
  const dayList = sp.d ? byDay.get(sp.d) ?? [] : [];

  return (
    <>
      <PageHeader title="Scheduler" subtitle="Календар публікацій (час — Europe/Kyiv)"
        actions={<><Link href={`?m=${prev}`} className="btn-ghost">←</Link><span className="w-36 text-center text-sm font-medium capitalize">{monthName}</span><Link href={`?m=${next}`} className="btn-ghost">→</Link><Link href="/posts/new" className="btn-primary">Новий пост</Link></>} />
      <div className="card overflow-hidden">
        <div className="grid grid-cols-7 border-b border-line bg-canvas">{WD.map((d) => <div key={d} className="px-3 py-2 text-xs font-medium text-muted">{d}</div>)}</div>
        <div className="grid grid-cols-7">
          {[...Array(lead)].map((_, i) => <div key={`l${i}`} className="min-h-28 border-b border-r border-line bg-canvas/50" />)}
          {[...Array(daysIn)].map((_, i) => {
            const d = i + 1; const list = byDay.get(String(d)) ?? [];
            const today = now.y === y && now.m === m && now.d === d;
            return (
              <Link key={d} href={`?m=${y}-${String(m).padStart(2, "0")}&d=${d}`} className={clsx("min-h-28 border-b border-r border-line p-2 transition hover:bg-canvas", sp.d === String(d) && "bg-indigo-50/50")}>
                <div className={clsx("mb-1 inline-flex h-6 w-6 items-center justify-center rounded-full text-xs", today ? "bg-brand text-white" : "text-muted")}>{d}</div>
                <div className="space-y-0.5">
                  {list.slice(0, 3).map((p) => (
                    <div key={p.id} className="flex items-center gap-1 truncate text-[11px]">
                      <span className={clsx("h-1.5 w-1.5 shrink-0 rounded-full", dot[p.status] ?? "bg-gray-400")} />
                      <span className="text-muted">{new Date(p.scheduled_at).toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit", timeZone: TZ })}</span>
                      <span className="truncate">@{p.account?.username}</span>
                    </div>
                  ))}
                  {list.length > 3 && <div className="text-[11px] text-muted">+{list.length - 3} ще</div>}
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {sp.d && (
        <Card title={`${sp.d} ${monthName}: ${dayList.length} публікацій`} className="mt-6">
          <ul className="divide-y divide-line">{dayList.map((p) => (
            <li key={p.id} className="flex items-center gap-3 py-2 text-sm">
              <span className="w-14 text-xs text-muted">{new Date(p.scheduled_at).toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit", timeZone: TZ })}</span>
              <span className="w-36 truncate font-medium">@{p.account?.username}</span>
              <span className="flex-1 truncate text-muted">{p.post?.text || "(медіа)"}</span>
              <Badge status={p.status} />
            </li>
          ))}</ul>
        </Card>
      )}

      <Card title="Повторювані розклади" className="mt-6">
        {schedules?.length ? (
          <div className="-m-5 overflow-x-auto"><table className="w-full">
            <thead className="border-b border-line"><tr><th className="th">Пост</th><th className="th">Правило</th><th className="th">Акаунтів</th><th className="th">Наступний запуск</th><th className="th" /></tr></thead>
            <tbody className="divide-y divide-line">{schedules.map((s: any) => (
              <tr key={s.id}>
                <td className="td max-w-xs truncate">{s.post?.text}</td>
                <td className="td text-xs">{s.frequency === "interval" ? `кожні ${s.interval_minutes} хв` : `${s.frequency === "weekly" ? s.weekdays.map((w: number) => WD[w - 1]).join(",") + " " : "щодня "}${s.times.join(", ")}`} <span className="text-muted">({s.timezone})</span></td>
                <td className="td">{s.account_ids.length}</td>
                <td className="td text-xs text-muted">{s.active ? fmtDate(s.next_run_at) : "вимкнено"}</td>
                <td className="td text-right"><form action={toggleSchedule.bind(null, s.id, !s.active)}><button className="btn-ghost py-1 text-xs">{s.active ? "Вимкнути" : "Увімкнути"}</button></form></td>
              </tr>
            ))}</tbody>
          </table></div>
        ) : <p className="text-sm text-muted">Немає повторюваних розкладів. Створіть пост у режимі «Повторювати».</p>}
      </Card>
    </>
  );
}
