import { serverDb } from "@/lib/supabase/server";
import { getSession, can } from "@/lib/auth";
import { PageHeader, Card, Badge, Empty, fmtDate } from "@/components/ui";
import { saveNetworkConfig, deleteNetworkConfig } from "@/app/actions/network";
import { NetworkTestButton } from "@/components/NetworkTestButton";

export const dynamic = "force-dynamic";

export default async function NetworkPage() {
  const s = await getSession();
  const db = await serverDb();
  const [{ data: configs }, { data: accounts }] = await Promise.all([
    db.from("network_configs").select("*").order("created_at"),
    db.from("accounts").select("id, username, network_config_id"),
  ]);
  const admin = can(s!.role, "admin");
  const usage = (id: string) => (accounts ?? []).filter((a) => a.network_config_id === id);

  return (
    <>
      <PageHeader title="Network Settings" subtitle="Мережеві параметри вихідних запитів сервера → graph.threads.net" />
      <div className="mb-6 rounded-lg border border-line bg-white px-4 py-3 text-xs leading-relaxed text-muted">
        Кожному акаунту можна статично призначити одну конфігурацію (HTTP / HTTPS / SOCKS5). Застосовується лише до запитів сервера до Threads API;
        медіа Meta завантажує з вашого публічного URL напряму. Автоматична ротація IP для обходу лімітів чи антифроду не реалізована свідомо —
        ліміти Threads прив’язані до акаунта й застосунку, а не до IP.
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="card">
          {configs?.length ? (
            <table className="w-full">
              <thead className="border-b border-line"><tr><th className="th">Назва</th><th className="th">Адреса</th><th className="th">Статус</th><th className="th">Акаунти</th><th className="th" /></tr></thead>
              <tbody className="divide-y divide-line">{configs.map((c) => (
                <tr key={c.id}>
                  <td className="td font-medium">{c.name}</td>
                  <td className="td font-mono text-xs">{c.protocol}://{c.username ? `${c.username}@` : ""}{c.host}:{c.port}</td>
                  <td className="td"><Badge status={c.status} />
                    <div className="mt-1 text-[11px] text-muted">{c.last_checked_at ? `${fmtDate(c.last_checked_at)}${c.last_latency_ms ? ` · ${c.last_latency_ms} мс` : ""}` : ""}</div>
                    {c.last_error && <div className="max-w-56 truncate text-[11px] text-red-600" title={c.last_error}>{c.last_error}</div>}
                  </td>
                  <td className="td text-xs">{usage(c.id).map((a) => `@${a.username}`).join(", ") || "—"}</td>
                  <td className="td whitespace-nowrap text-right">{admin && <div className="flex justify-end gap-2"><NetworkTestButton id={c.id} />
                    <form action={deleteNetworkConfig.bind(null, c.id)}><button className="btn-danger py-1 text-xs">Видалити</button></form></div>}</td>
                </tr>
              ))}</tbody>
            </table>
          ) : <Empty title="Конфігурацій немає" text="Усі акаунти використовують пряме підключення сервера." />}
        </div>
        {admin && (
          <Card title="Нова конфігурація">
            <form action={saveNetworkConfig} className="space-y-3">
              <div><label className="label">Назва</label><input name="name" required className="input" /></div>
              <div className="grid grid-cols-3 gap-2">
                <div><label className="label">Протокол</label><select name="protocol" className="input"><option>http</option><option>https</option><option>socks5</option></select></div>
                <div className="col-span-2"><label className="label">Хост</label><input name="host" required className="input" /></div>
              </div>
              <div><label className="label">Порт</label><input name="port" type="number" required min={1} max={65535} className="input" /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="label">Логін</label><input name="username" className="input" autoComplete="off" /></div>
                <div><label className="label">Пароль</label><input name="password" type="password" className="input" autoComplete="new-password" /></div>
              </div>
              <p className="text-[11px] text-muted">Пароль шифрується AES-256-GCM і не повертається в інтерфейс.</p>
              <button className="btn-primary w-full">Зберегти</button>
            </form>
            <p className="mt-4 text-xs text-muted">Призначення акаунту — на сторінці акаунта → «Налаштування».</p>
          </Card>
        )}
      </div>
    </>
  );
}
