import { Sidebar } from "@/components/Sidebar";
import { requireUser } from "@/lib/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const s = await requireUser();
  return (
    <div className="flex min-h-screen">
      <Sidebar email={s.user.email ?? ""} role={s.role} />
      <main className="min-w-0 flex-1 px-8 py-7"><div className="mx-auto max-w-7xl">{children}</div></main>
    </div>
  );
}
