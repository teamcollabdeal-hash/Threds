"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Link2, X } from "lucide-react";
import clsx from "clsx";
import { browserDb } from "@/lib/supabase/client";
import { createPost, type ComposerInput } from "@/app/actions/posts";
import { Avatar } from "./ui";
import type { MediaItem } from "@/lib/types";

const WD = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"];

export function Composer({ accounts, groups, members, campaigns }: { accounts: any[]; groups: any[]; members: any[]; campaigns: any[] }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [link, setLink] = useState("");
  const [topic, setTopic] = useState("");
  const [campaign, setCampaign] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<ComposerInput["mode"]>("schedule");
  const [when, setWhen] = useState("");
  const [offset, setOffset] = useState(0);
  const [freq, setFreq] = useState<"daily" | "weekly" | "interval">("daily");
  const [times, setTimes] = useState("09:00, 18:00");
  const [weekdays, setWeekdays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [interval, setIntervalMin] = useState(240);
  const [tz, setTz] = useState("Europe/Kyiv");
  const [endsAt, setEndsAt] = useState("");
  const [urlInput, setUrlInput] = useState("");
  const [uploading, setUploading] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [pending, start] = useTransition();

  const len = [...text].length;
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const pickGroup = (gid: string) => setSel((s) => new Set([...s, ...members.filter((m) => m.group_id === gid).map((m) => m.account_id)]));
  const active = useMemo(() => accounts.filter((a) => a.status !== "disconnected"), [accounts]);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    const db = browserDb();
    const added: MediaItem[] = [];
    for (const f of Array.from(files)) {
      const kind = f.type.startsWith("video") ? "video" : "image";
      const path = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}-${f.name.replace(/[^\w.-]/g, "_")}`;
      const { error } = await db.storage.from("media").upload(path, f, { contentType: f.type });
      if (error) { setErrors([`Завантаження ${f.name}: ${error.message}`]); continue; }
      const { data } = db.storage.from("media").getPublicUrl(path);
      added.push({ url: data.publicUrl, kind });
    }
    setMedia((m) => [...m, ...added].slice(0, 20));
    setUploading(false);
  }

  function submit() {
    setErrors([]);
    const input: ComposerInput = {
      text, media, link_attachment: link || null, topic_tag: topic || null, campaign_id: campaign || null,
      account_ids: [...sel], mode,
      scheduled_at: mode === "schedule" && when ? new Date(when).toISOString() : null,
      per_account_offset_minutes: offset,
      recurrence: mode === "recurring" ? {
        frequency: freq, times: times.split(/[,\s]+/).filter(Boolean), weekdays: freq === "weekly" ? weekdays : [],
        interval_minutes: freq === "interval" ? interval : undefined, timezone: tz, ends_at: endsAt ? new Date(endsAt).toISOString() : null,
      } : undefined,
    };
    start(async () => {
      const r = await createPost(input);
      if (!r.ok) return setErrors(r.errors ?? ["Помилка"]);
      router.push(mode === "recurring" ? "/scheduler" : "/posts");
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="space-y-6">
        <div className="card p-5">
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={6} placeholder="Що нового?"
            className="w-full resize-none text-[15px] outline-none placeholder:text-gray-400" />
          <div className="flex flex-wrap gap-2 py-2">
            {media.map((m, i) => (
              <div key={m.url} className="relative h-20 w-20 overflow-hidden rounded-lg border border-line bg-canvas">
                {m.kind === "image" ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={m.url} alt="" className="h-full w-full object-cover" />
                  : <video src={m.url} className="h-full w-full object-cover" muted />}
                <button onClick={() => setMedia(media.filter((_, j) => j !== i))} className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5 text-white"><X size={12} /></button>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
            <div className="flex items-center gap-2">
              <label className="btn-ghost cursor-pointer py-1.5"><ImagePlus size={15} />{uploading ? "Завантаження…" : "Фото / відео"}
                <input type="file" accept="image/jpeg,image/png,video/mp4,video/quicktime" multiple hidden onChange={(e) => upload(e.target.files)} />
              </label>
              <input value={urlInput} onChange={(e) => setUrlInput(e.target.value)} placeholder="або https://… URL медіа" className="input w-56 py-1.5" />
              <button className="btn-ghost py-1.5" onClick={() => { if (urlInput) { setMedia([...media, { url: urlInput, kind: /\.(mp4|mov)/i.test(urlInput) ? "video" : "image" }]); setUrlInput(""); } }}>Додати</button>
            </div>
            <span className={clsx("text-xs tabular-nums", len > 500 ? "text-red-600" : "text-muted")}>{len}/500</span>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div><label className="label"><Link2 size={11} className="inline" /> Link attachment (лише текст)</label><input value={link} onChange={(e) => setLink(e.target.value)} className="input" disabled={media.length > 0} /></div>
            <div><label className="label">Topic tag</label><input value={topic} onChange={(e) => setTopic(e.target.value)} className="input" maxLength={50} /></div>
            <div><label className="label">Кампанія</label>
              <select value={campaign} onChange={(e) => setCampaign(e.target.value)} className="input"><option value="">—</option>{campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
            </div>
          </div>
        </div>

        <div className="card p-5">
          <div className="mb-4 inline-flex rounded-lg border border-line p-0.5 text-sm">
            {([["now", "Зараз"], ["schedule", "Запланувати"], ["recurring", "Повторювати"], ["draft", "Чернетка"]] as const).map(([k, l]) => (
              <button key={k} onClick={() => setMode(k)} className={clsx("rounded-md px-3 py-1.5", mode === k ? "bg-brand text-white" : "text-muted")}>{l}</button>
            ))}
          </div>
          {mode === "schedule" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div><label className="label">Дата і час (ваш локальний час)</label><input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="input" /></div>
              <div><label className="label">Зсув між акаунтами, хв (індивідуальний графік)</label><input type="number" min={0} value={offset} onChange={(e) => setOffset(+e.target.value)} className="input" /></div>
            </div>
          )}
          {mode === "now" && <div><label className="label">Зсув між акаунтами, хв</label><input type="number" min={0} value={offset} onChange={(e) => setOffset(+e.target.value)} className="input max-w-40" /><p className="mt-2 text-xs text-muted">Публікація потрапить у чергу протягом ~20 секунд.</p></div>}
          {mode === "recurring" && (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-3">
                <div><label className="label">Частота</label><select value={freq} onChange={(e) => setFreq(e.target.value as any)} className="input"><option value="daily">Щодня</option><option value="weekly">По днях тижня</option><option value="interval">Кожні N хв</option></select></div>
                {freq !== "interval"
                  ? <div><label className="label">Час (через кому)</label><input value={times} onChange={(e) => setTimes(e.target.value)} className="input" /></div>
                  : <div><label className="label">Інтервал, хв (≥5)</label><input type="number" min={5} value={interval} onChange={(e) => setIntervalMin(+e.target.value)} className="input" /></div>}
                <div><label className="label">Часовий пояс</label><input value={tz} onChange={(e) => setTz(e.target.value)} className="input" /></div>
              </div>
              {freq === "weekly" && <div className="flex gap-1">{WD.map((d, i) => (
                <button key={d} onClick={() => setWeekdays((w) => w.includes(i + 1) ? w.filter((x) => x !== i + 1) : [...w, i + 1])}
                  className={clsx("h-8 w-10 rounded-md border text-xs", weekdays.includes(i + 1) ? "border-brand bg-brand text-white" : "border-line")}>{d}</button>
              ))}</div>}
              <div className="max-w-xs"><label className="label">Завершити (необов’язково)</label><input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} className="input" /></div>
            </div>
          )}
        </div>
        {errors.length > 0 && <ul className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errors.map((e) => <li key={e}>• {e}</li>)}</ul>}
        <div className="flex justify-end gap-2">
          <button className="btn-primary" disabled={pending} onClick={submit}>{pending ? "Збереження…" : `Зберегти для ${sel.size} акаунтів`}</button>
        </div>
      </div>

      <div className="card h-fit">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <span className="text-sm font-semibold">Акаунти ({sel.size})</span>
          <div className="flex gap-2 text-xs">
            <button className="text-muted hover:text-ink" onClick={() => setSel(new Set(active.filter((a) => a.status === "active").map((a) => a.id)))}>Усі активні</button>
            <button className="text-muted hover:text-ink" onClick={() => setSel(new Set())}>Очистити</button>
          </div>
        </div>
        {groups.length > 0 && <div className="flex flex-wrap gap-1 border-b border-line px-4 py-2">{groups.map((g) => (
          <button key={g.id} onClick={() => pickGroup(g.id)} className="rounded px-1.5 py-0.5 text-[11px]" style={{ background: g.color + "1a", color: g.color }}>+ {g.name}</button>
        ))}</div>}
        <ul className="max-h-[520px] divide-y divide-line overflow-y-auto">
          {active.map((a) => (
            <li key={a.id}>
              <label className="flex cursor-pointer items-center gap-2.5 px-4 py-2 hover:bg-canvas">
                <input type="checkbox" checked={sel.has(a.id)} onChange={() => toggle(a.id)} />
                <Avatar url={a.avatar_url} name={a.username} size={24} />
                <span className="flex-1 text-sm">@{a.username}</span>
                {a.status !== "active" && <span className="text-[10px] text-amber-600">{a.status}</span>}
              </label>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
