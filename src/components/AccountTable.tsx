"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { Avatar, Badge, fmtDate } from "./ui";
import { bulkAccountAction } from "@/app/actions/accounts";

export function AccountTable({ accounts, groups, members, stats, canAdmin }: {
  accounts: any[]; groups: any[]; members: any[]; stats: any[]; canAdmin: boolean;
}) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [group, setGroup] = useState("");
  const [pending, start] = useTransition();
  const byAcc = new Map(stats.map((s) => [s.account_id, s]));
  const gmap = new Map(groups.map((g) => [g.id, g]));
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const run = (a: "pause" | "resume" | "group") => start(async () => { await bulkAccountAction([...sel], a, group); setSel(new Set()); });
  const expiring = (d: string | null) => d && new Date(d).getTime() - Date.now() < 10 * 86400_000;

  return (
    <>
      {canAdmin && sel.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-line bg-canvas px-4 py-2 text-sm">
          <span className="font-medium">Вибрано: {sel.size}</span>
          <button className="btn-ghost py-1" disabled={pending} onClick={() => run("pause")}>Призупинити</button>
          <button className="btn-ghost py-1" disabled={pending} onClick={() => run("resume")}>Відновити</button>
          <select className="input w-44 py-1" value={group} onChange={(e) => setGroup(e.target.value)}>
            <option value="">До групи…</option>{groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
          <button className="btn-ghost py-1" disabled={!group || pending} onClick={() => run("group")}>Додати</button>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="border-b border-line">
            <tr>
              {canAdmin && <th className="th w-8"><input type="checkbox" checked={sel.size === accounts.length} onChange={(e) => setSel(e.target.checked ? new Set(accounts.map((a) => a.id)) : new Set())} /></th>}
              <th className="th">Акаунт</th><th className="th">Статус</th><th className="th">Групи</th>
              <th className="th text-right">Опубл. / 24г</th><th className="th text-right">Заплан.</th><th className="th">Токен до</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {accounts.map((a) => {
              const s = byAcc.get(a.id) ?? {};
              return (
                <tr key={a.id} className="hover:bg-canvas">
                  {canAdmin && <td className="td"><input type="checkbox" checked={sel.has(a.id)} onChange={() => toggle(a.id)} /></td>}
                  <td className="td">
                    <Link href={`/accounts/${a.id}`} className="flex items-center gap-2.5">
                      <Avatar url={a.avatar_url} name={a.username} />
                      <div><div className="font-medium">@{a.username}</div><div className="text-xs text-muted">{a.display_name}</div></div>
                    </Link>
                  </td>
                  <td className="td"><Badge status={a.status} />{a.status_reason && <div className="mt-1 max-w-48 truncate text-xs text-muted" title={a.status_reason}>{a.status_reason}</div>}</td>
                  <td className="td"><div className="flex flex-wrap gap-1">{members.filter((m) => m.account_id === a.id).map((m) => {
                    const g = gmap.get(m.group_id); return g && <span key={m.group_id} className="rounded px-1.5 py-0.5 text-[11px]" style={{ background: g.color + "1a", color: g.color }}>{g.name}</span>;
                  })}</div></td>
                  <td className="td text-right tabular-nums">{s.published ?? 0} <span className="text-muted">/ {s.published_24h ?? 0}</span></td>
                  <td className="td text-right tabular-nums">{s.scheduled ?? 0}</td>
                  <td className={`td text-xs ${expiring(a.token_expires_at) ? "text-amber-600" : "text-muted"}`}>{fmtDate(a.token_expires_at)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
