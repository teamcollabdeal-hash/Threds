"use client";
import { useState, useTransition } from "react";
import { Badge, fmtDate } from "./ui";
import { cancelPublications, retryPublications, reschedulePublication, deletePublished } from "@/app/actions/posts";

const editable = ["scheduled", "draft", "paused", "failed"];

export function PublicationTable({ rows, canEdit, canAdmin }: { rows: any[]; canEdit: boolean; canAdmin: boolean }) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [edit, setEdit] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [p, start] = useTransition();
  const ids = [...sel];
  const act = (fn: () => Promise<unknown>) => start(async () => { try { setErr(null); await fn(); setSel(new Set()); } catch (e) { setErr((e as Error).message); } });
  const toLocal = (iso: string) => { const d = new Date(iso); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };

  return (
    <>
      {err && <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{err}</div>}
      {canEdit && sel.size > 0 && (
        <div className="flex items-center gap-2 border-b border-line bg-canvas px-4 py-2 text-sm">
          <span className="font-medium">Вибрано: {sel.size}</span>
          <button className="btn-ghost py-1" disabled={p} onClick={() => act(() => cancelPublications(ids))}>Скасувати</button>
          <button className="btn-ghost py-1" disabled={p} onClick={() => act(() => retryPublications(ids))}>Повторити / запланувати</button>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="border-b border-line"><tr>
            {canEdit && <th className="th w-8"><input type="checkbox" onChange={(e) => setSel(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())} /></th>}
            <th className="th">Контент</th><th className="th">Акаунт</th><th className="th">Статус</th><th className="th">Час</th><th className="th text-right">Перегл.</th><th className="th" />
          </tr></thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.id} className="align-top hover:bg-canvas">
                {canEdit && <td className="td"><input type="checkbox" checked={sel.has(r.id)} onChange={() => setSel((s) => { const n = new Set(s); n.has(r.id) ? n.delete(r.id) : n.add(r.id); return n; })} /></td>}
                <td className="td max-w-md">
                  <div className="line-clamp-2">{r.post?.text || <span className="text-muted">(без тексту)</span>}</div>
                  <div className="mt-1 flex gap-2 text-[11px] text-muted">
                    {r.post?.media?.length > 0 && <span>{r.post.media.length} медіа</span>}
                    {r.post?.campaign?.name && <span>· {r.post.campaign.name}</span>}
                    {r.attempts > 0 && <span>· спроб: {r.attempts}</span>}
                  </div>
                  {r.error_message && <div className="mt-1 text-xs text-red-600">{r.error_message}</div>}
                </td>
                <td className="td">@{r.account?.username}</td>
                <td className="td"><Badge status={r.status} /></td>
                <td className="td text-xs text-muted">
                  {edit === r.id ? (
                    <form action={(fd) => act(async () => { await reschedulePublication(r.id, fd); setEdit(null); })} className="flex gap-1">
                      <input type="datetime-local" name="scheduled_at" defaultValue={toLocal(r.scheduled_at)} className="input py-1 text-xs"
                        onChange={(e) => { const h = e.currentTarget.form!.elements.namedItem("iso") as HTMLInputElement; h.value = new Date(e.currentTarget.value).toISOString(); }} />
                      <input type="hidden" name="iso" />
                      <button className="btn-ghost py-1 text-xs">OK</button>
                    </form>
                  ) : r.permalink ? <a href={r.permalink} target="_blank" className="underline">{fmtDate(r.published_at)}</a> : fmtDate(r.scheduled_at)}
                </td>
                <td className="td text-right tabular-nums">{r.insight?.views ?? "—"}</td>
                <td className="td whitespace-nowrap text-right text-xs">
                  {canEdit && editable.includes(r.status) && <button className="text-muted hover:text-ink" onClick={() => setEdit(edit === r.id ? null : r.id)}>Перенести</button>}
                  {canAdmin && r.status === "published" && r.threads_media_id && (
                    <button className="ml-3 text-red-600 hover:underline" onClick={() => confirm("Видалити пост з Threads?") && act(() => deletePublished(r.id))}>Видалити</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
