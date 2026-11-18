import { serverDb } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { BulkUpload } from "@/components/BulkUpload";

export const dynamic = "force-dynamic";

export default async function Bulk() {
  await requireRole("editor");
  const db = await serverDb();
  const { data: accounts } = await db.from("accounts").select("id, username, status").neq("status", "disconnected").order("username");
  return (
    <>
      <PageHeader title="Bulk Upload" subtitle="Масове завантаження постів з CSV або таблиці з розподілом між акаунтами" />
      <BulkUpload accounts={accounts ?? []} />
    </>
  );
}
