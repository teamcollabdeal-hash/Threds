import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Pending() {
  const s = await getSession();
  if (!s) redirect("/login");
  if (s.role !== "pending") redirect("/");
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="card w-full max-w-sm p-7 text-center">
        <div className="mb-2 font-semibold">Очікує схвалення</div>
        <p className="text-sm text-muted">Акаунт {s.user.email} створено. Доступ до панелі відкриє owner у розділі Settings.</p>
        <form action="/auth/signout" method="post" className="mt-5"><button className="btn w-full">Вийти</button></form>
      </div>
    </div>
  );
}
