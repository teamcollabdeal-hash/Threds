import { serverDb } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { Composer } from "@/components/Composer";

export const dynamic = "force-dynamic";

export default async function NewPost() {
  await requireRole("editor");
  const db = await serverDb();
  const [{ data: accounts }, { data: groups }, { data: members }, { data: campaigns }] = await Promise.all([
    db.from("accounts").select("id, username, avatar_url, status, timezone").neq("status", "disconnected").order("username"),
    db.from("account_groups").select("id, name, kind, color"),
    db.from("account_group_members").select("*"),
    db.from("campaigns").select("id, name").in("status", ["draft", "active"]),
  ]);
  return (
    <>
      <PageHeader title="Новий пост" subtitle="Текст, фото, відео або карусель — на один чи кілька акаунтів" />
      <Composer accounts={accounts ?? []} groups={groups ?? []} members={members ?? []} campaigns={campaigns ?? []} />
    </>
  );
}
