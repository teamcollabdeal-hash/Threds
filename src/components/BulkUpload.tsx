"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import clsx from "clsx";
import { normalizeRow, distribute, type BulkRow } from "@/lib/distribute";
import { validatePost } from "@/lib/validate";
import { importBulk } from "@/app/actions/bulk";

const SAMPLE = `text,media_urls,accounts,scheduled_at,campaign
"Перший пост кампанії",,,2026-12-01T09:00:00+02:00,Зимовий розпродаж
"Пост з фото",https://example.com/photo.jpg,shop_kyiv;shop_lviv,,Зимовий розпродаж
"Третій пост — час призначиться автоматично",,,,Зимовий розпродаж`;

export function BulkUpload({ accounts }: { accounts: { id: string; username: string; status: string }[] }) {
  const router = useRouter();
  const [raw, setRaw] = useState("");
  const [rows, setRows] = useState<BulkRow[]>([]);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<"row" | "round_robin" | "all">("round_robin");
  const [start, setStart] = useState("");
  const [spacing, setSpacing] = useState(60);
  const [campaign, setCampaign] = useState("");
  const [draft, setDraft] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string[] } | null>(null);
  const [pending, startT] = useTransition();

  function parse(text: string) {
    setRaw(text);
    const sep = text.split("\n")[0]?.includes("\t") ? "\t" : undefined;
    const r = Papa.parse<Record<string, string>>(text.trim(), { header: true, skipEmptyLines: true, delimiter: sep, transformHeader: (h) => h.trim().toLowerCase() });
    const out = r.data.map(normalizeRow).filter((x) => x.text || x.media.length);
    setRows(out);
    const c = out.find((x) => x.campaign)?.campaign;
    if (c && !campaign) setCampaign(c);
  }

  const map = useMemo(() => new Map(accounts.map((a) => [a.username.toLowerCase(), a.id])), [accounts]);
  const name = useMemo(() => new Map(accounts.map((a) => [a.id, a.username])), [accounts]);
  const startDate = start ? new Date(start) : new Date(Date.now() + 10 * 60_000);
  const preview = useMemo(() => distribute(rows, [...sel], map, mode, startDate, spacing), [rows, sel, map, mode, start, spacing]); // eslint-disable-line
  const rowErrors = useMemo(() => rows.map((r) => validatePost({ text: r.text, media: r.media.map((url) => ({ url, kind: "image" as const })) })), [rows]);
  const invalid = rowErrors.filter((e) => e.length).length;

  function submit() {
    startT(async () => {
      const r = await importBulk({ rows, account_ids: [...sel], mode, start: startDate.toISOString(), spacing_minutes: spacing, campaign_name: campaign || null, as_draft: draft });
      setResult(r.ok ? { ok: true, msg: [`Створено ${r.created} публікацій`] } : { ok: false, msg: r.errors });
      if (r.ok) setTimeout(() => router.push("/posts"), 1200);
    });
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-semibold">1. Дані</div>
            <div className="flex gap-2">
              <label className="btn-ghost cursor-pointer py-1.5">CSV-файл<input type="file" accept=".csv,.tsv,.txt" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (f) parse(await f.text()); }} /></label>
              <button className="btn-ghost py-1.5" onClick={() => parse(SAMPLE)}>Приклад</button>
            </div>
          </div>
          <textarea value={raw} onChange={(e) => parse(e.target.value)} rows={8} className="input font-mono text-xs"
            placeholder={"Вставте CSV або скопіюйте діапазон з Google Sheets / Excel (з рядком заголовків).\nКолонки: text, media_urls, accounts, scheduled_at, campaign"} />
          <p className="mt-2 text-xs text-muted">media_urls — публічні https-посилання через «|». accounts — usernames через «;». scheduled_at — ISO-дата; якщо порожня, час призначиться автоматично.</p>
        </div>

        <div className="card p-5 space-y-3">
          <div className="text-sm font-semibold">2. Розподіл</div>
          <div><label className="label">Режим</label>
            <select value={mode} onChange={(e) => setMode(e.target.value as any)} className="input">
              <option value="round_robin">По черзі між акаунтами (1 рядок → 1 акаунт)</option>
              <option value="all">Кожен рядок → усі вибрані акаунти</option>
              <option value="row">За колонкою accounts</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className="label">Старт</label><input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} className="input" /></div>
            <div><label className="label">Крок, хв</label><input type="number" min={0} value={spacing} onChange={(e) => setSpacing(+e.target.value)} className="input" /></div>
          </div>
          <div><label className="label">Кампанія (створиться)</label><input value={campaign} onChange={(e) => setCampaign(e.target.value)} className="input" /></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft} onChange={(e) => setDraft(e.target.checked)} />Зберегти як чернетки</label>
          <div>
            <div className="mb-1 flex justify-between"><span className="label">Акаунти ({sel.size})</span>
              <button className="text-xs text-muted" onClick={() => setSel(sel.size ? new Set() : new Set(accounts.filter((a) => a.status === "active").map((a) => a.id)))}>{sel.size ? "Очистити" : "Усі активні"}</button></div>
            <div className="max-h-44 space-y-1 overflow-y-auto rounded-lg border border-line p-2">
              {accounts.map((a) => <label key={a.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={sel.has(a.id)} onChange={() => setSel((s) => { const n = new Set(s); n.has(a.id) ? n.delete(a.id) : n.add(a.id); return n; })} />@{a.username}</label>)}
            </div>
          </div>
        </div>
      </div>

      {rows.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between border-b border-line px-5 py-3">
            <div className="text-sm font-semibold">3. Перегляд: {rows.length} постів → {preview.plan.length} публікацій {invalid > 0 && <span className="ml-2 text-red-600">({invalid} з помилками)</span>}</div>
            <button className="btn-primary" disabled={pending || invalid > 0 || preview.errors.length > 0 || !preview.plan.length} onClick={submit}>{pending ? "Імпорт…" : "Імпортувати"}</button>
          </div>
          {preview.errors.length > 0 && <ul className="border-b border-line bg-amber-50 px-5 py-2 text-xs text-amber-800">{preview.errors.slice(0, 10).map((e) => <li key={e}>{e}</li>)}</ul>}
          {result && <div className={clsx("border-b px-5 py-2 text-sm", result.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700")}>{result.msg.slice(0, 15).map((m) => <div key={m}>{m}</div>)}</div>}
          <div className="max-h-[480px] overflow-auto">
            <table className="w-full">
              <thead className="sticky top-0 border-b border-line bg-white"><tr><th className="th">#</th><th className="th">Текст</th><th className="th">Медіа</th><th className="th">Акаунти → час</th></tr></thead>
              <tbody className="divide-y divide-line">{rows.map((r, i) => (
                <tr key={i} className={clsx(rowErrors[i].length && "bg-red-50/60")}>
                  <td className="td text-xs text-muted">{i + 1}</td>
                  <td className="td max-w-md"><div className="line-clamp-2">{r.text}</div><div className="text-[11px] text-muted">{[...r.text].length}/500</div>{rowErrors[i].map((e) => <div key={e} className="text-xs text-red-600">{e}</div>)}</td>
                  <td className="td text-xs">{r.media.length || "—"}</td>
                  <td className="td text-xs">{preview.plan.filter((p) => p.rowIndex === i).map((p) => (
                    <div key={p.accountId}>@{name.get(p.accountId)} <span className="text-muted">{p.scheduledAt.toLocaleString("uk-UA", { dateStyle: "short", timeStyle: "short" })}</span></div>
                  ))}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
