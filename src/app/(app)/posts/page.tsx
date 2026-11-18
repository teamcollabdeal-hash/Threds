import Link from "next/link";
import { serverDb } from "@/lib/supabase/server";
import { getSession, can } from "@/lib/auth";
import { PageHeader, Empty } from "@/components/ui";
import { PublicationTable } from "@/components/PublicationTable";

export const dynamic = "force-dynamic";
const PAGE = 50;

export default async function Posts({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const s = await getSession();
  const db = await serverDb();
  const page = Math.max(1, Number(sp.page ?? 1));
  let q = db.from("publications")
    .select("id, status, scheduled_at, published_at, permalink, error_message, attempts, threads_media_id, post_id, account:accounts(id, username), post:posts(text, media, campaign:campaigns(name)), insight:publication_insights(views, likes)", { count: "exact" })
    .order("scheduled_at", { ascending: false }).range((page - 1) * PAGE, page * PAGE - 1);
  if (sp.status) q = q.eq("status", sp.status);
  if (sp.account) q = q.eq("account_id", sp.account);
  const [{ data, count }, { data: accounts }] = await Promise.all([q, db.from("accounts").select("id, username").order("username")]);
  const pages = Math.ceil((count ?? 0) / PAGE);
  const qs = (p: number) => `?${new URLSearchParams({ ...(sp as Record<string, string>), page: String(p) })}`;

  return (
    <>
      <PageHeader title="Posts" subtitle={`${count ?? 0} публікацій`} actions={can(s!.role, "editor") && <Link href="/posts/new" className="btn-primary">Новий пост</Link>} />
      <div className="card">
        <form className="flex flex-wrap gap-2 border-b border-line p-3">
          <select name="status" defaultValue={sp.status ?? ""} className="input max-w-48">
            <option value="">Усі статуси</option>
            {["draft", "scheduled", "queued", "publishing", "published", "failed", "paused", "cancelled"].map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
          <select name="account" defaultValue={sp.account ?? ""} className="input max-w-56">
            <option value="">Усі акаунти</option>{accounts?.map((a) => <option key={a.id} value={a.id}>@{a.username}</option>)}
          </select>
          <button className="btn-ghost">Фільтр</button>
        </form>
        {data?.length ? <PublicationTable rows={data as any[]} canEdit={can(s!.role, "editor")} canAdmin={can(s!.role, "admin")} />
          : <Empty title="Публікацій немає" action={<Link href="/posts/new" className="btn-primary">Створити пост</Link>} />}
        {pages > 1 && (
          <div className="flex items-center justify-between border-t border-line px-4 py-3 text-sm">
            <span className="text-muted">Сторінка {page} з {pages}</span>
            <div className="flex gap-2">
              {page > 1 && <Link className="btn-ghost py-1" href={qs(page - 1)}>←</Link>}
              {page < pages && <Link className="btn-ghost py-1" href={qs(page + 1)}>→</Link>}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
