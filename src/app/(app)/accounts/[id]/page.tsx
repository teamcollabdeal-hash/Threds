import Link from "next/link";
import { notFound } from "next/navigation";
import { serverDb } from "@/lib/supabase/server";
import { getSession, can } from "@/lib/auth";
import { PageHeader, Card, Stat, Badge, Avatar, fmtDate } from "@/components/ui";
import { updateAccountSettings, setAccountStatus, deleteAccount } from "@/app/actions/accounts";
import { QuotaButton } from "@/components/QuotaButton";

export const dynamic = "force-dynamic";

export default async function AccountPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await getSession();
  const db = await serverDb();
  const [{ data: a }, { data: st }, { data: pubs }, { data: nets }, { data: groups }, { data: mem }, { data: ins }, { data: logs }] = await Promise.all([
    db.from("accounts").select("*").eq("id", id).single(),
    db.from("account_stats").select("*").eq("account_id", id).maybeSingle(),
    db.from("publications").select("id, status, scheduled_at, published_at, permalink, error_message, post:posts(text), insight:publication_insights(views, likes, replies, reposts)")
      .eq("account_id", id).order("scheduled_at", { ascending: false }).limit(25),
    db.from("network_configs").select("id, name, protocol, host, port, status"),
    db.from("account_groups").select("*").order("kind"),
    db.from("account_group_members").select("group_id").eq("account_id", id),
    db.from("account_insights").select("*").eq("account_id", id).order("day", { ascending: false }).limit(1),
    db.from("logs").select("id, level, message, created_at").eq("account_id", id).order("created_at", { ascending: false }).limit(10),
  ]);
  if (!a) notFound();
  const admin = can(s!.role, "admin");
  const inGroup = new Set((mem ?? []).map((m) => m.group_id));
  const day = ins?.[0];

  return (
    <>
      <PageHeader title={`@${a.username}`} subtitle={a.display_name ?? undefined}
        actions={admin && (
          <>
            {a.status === "auth_error" || a.status === "disconnected"
              ? <a href="/api/threads/connect" className="btn-primary">Авторизувати повторно</a>
              : a.status === "paused"
                ? <form action={setAccountStatus.bind(null, id, "active")}><button className="btn-ghost">Відновити</button></form>
                : <form action={setAccountStatus.bind(null, id, "paused")}><button className="btn-ghost">Призупинити</button></form>}
            {a.status !== "disconnected" && <form action={setAccountStatus.bind(null, id, "disconnected")}><button className="btn-danger">Відключити й відкликати токен</button></form>}
          </>
        )} />

      <div className="mb-6 flex items-center gap-4 card p-5">
        <Avatar url={a.avatar_url} name={a.username} size={56} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2"><Badge status={a.status} />{a.status_reason && <span className="text-xs text-red-600">{a.status_reason}</span>}</div>
          <p className="mt-1.5 line-clamp-2 text-sm text-muted">{a.biography || "Без опису"}</p>
        </div>
        <div className="text-right text-xs text-muted">
          <div>Підключено: {fmtDate(a.connected_at)}</div>
          <div>Токен дійсний до: {fmtDate(a.token_expires_at)}</div>
          <div>Продовжено: {fmtDate(a.token_refreshed_at)}</div>
          <div className="mt-2"><QuotaButton accountId={id} /></div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-6">
        <Stat label="Опубліковано" value={st?.published ?? 0} tone="good" />
        <Stat label="За 24 год" value={`${st?.published_24h ?? 0} / ${a.daily_limit}`} />
        <Stat label="Заплановано" value={st?.scheduled ?? 0} />
        <Stat label="Невдалі" value={st?.failed ?? 0} tone={st?.failed ? "bad" : "default"} />
        <Stat label="Підписники" value={a.followers_count ?? "—"} />
        <Stat label="Перегляди (доба)" value={day?.views ?? "—"} hint={day ? `${day.likes ?? 0} ♥ · ${day.replies ?? 0} відп.` : "дані з API"} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
        <Card title="Публікації">
          <div className="-m-5 overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-line"><tr><th className="th">Текст</th><th className="th">Статус</th><th className="th">Час</th><th className="th text-right">Перегл.</th><th className="th text-right">♥</th></tr></thead>
              <tbody className="divide-y divide-line">
                {(pubs ?? []).map((p: any) => (
                  <tr key={p.id}>
                    <td className="td max-w-xs"><div className="truncate">{p.post?.text || "(медіа)"}</div>{p.error_message && <div className="truncate text-xs text-red-600">{p.error_message}</div>}</td>
                    <td className="td"><Badge status={p.status} /></td>
                    <td className="td text-xs text-muted">{p.permalink ? <a href={p.permalink} target="_blank" className="underline">{fmtDate(p.published_at)}</a> : fmtDate(p.scheduled_at)}</td>
                    <td className="td text-right tabular-nums">{p.insight?.views ?? "—"}</td>
                    <td className="td text-right tabular-nums">{p.insight?.likes ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="space-y-6">
          <Card title="Налаштування акаунта">
            <form action={updateAccountSettings.bind(null, id)} className="space-y-3">
              <fieldset disabled={!admin} className="space-y-3">
                <div><label className="label">Часовий пояс</label><input name="timezone" defaultValue={a.timezone} className="input" /></div>
                <div className="grid grid-cols-2 gap-2">
                  <div><label className="label">Ліміт постів / 24 год</label><input name="daily_limit" type="number" min={1} max={250} defaultValue={a.daily_limit} className="input" /></div>
                  <div><label className="label">Мін. інтервал, хв</label><input name="min_interval_minutes" type="number" min={0} defaultValue={a.min_interval_minutes} className="input" /></div>
                </div>
                <div><label className="label">Мережева конфігурація</label>
                  <select name="network_config_id" defaultValue={a.network_config_id ?? ""} className="input">
                    <option value="">Пряме підключення</option>
                    {nets?.map((n) => <option key={n.id} value={n.id}>{n.name} ({n.protocol}://{n.host}:{n.port})</option>)}
                  </select>
                </div>
                <div><label className="label">Групи</label>
                  <div className="flex flex-wrap gap-2">{groups?.map((g) => (
                    <label key={g.id} className="flex items-center gap-1 text-xs"><input type="checkbox" name="groups" value={g.id} defaultChecked={inGroup.has(g.id)} />{g.name}</label>
                  ))}</div>
                </div>
                <div><label className="label">Нотатки</label><textarea name="notes" defaultValue={a.notes ?? ""} rows={2} className="input" /></div>
                <button className="btn-primary w-full">Зберегти</button>
              </fieldset>
            </form>
          </Card>
          <Card title="Події акаунта" actions={<Link href={`/logs?account=${id}`} className="text-xs text-muted">Усі →</Link>}>
            <ul className="space-y-2">{(logs ?? []).map((l) => <li key={l.id} className="text-xs"><Badge status={l.level} /> <span className="text-muted">{fmtDate(l.created_at)}</span><div className="mt-0.5">{l.message}</div></li>)}</ul>
          </Card>
          {s!.role === "owner" && <form action={deleteAccount.bind(null, id)}><button className="text-xs text-red-600 hover:underline">Видалити акаунт з сервісу назавжди</button></form>}
        </div>
      </div>
    </>
  );
}
