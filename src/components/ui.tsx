import clsx from "clsx";
import type { ReactNode } from "react";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, children, className, actions }: { title?: string; children: ReactNode; className?: string; actions?: ReactNode }) {
  return (
    <section className={clsx("card", className)}>
      {title && (
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 className="text-sm font-semibold">{title}</h2>{actions}
        </div>
      )}
      <div className={title ? "p-5" : ""}>{children}</div>
    </section>
  );
}

export function Stat({ label, value, hint, tone = "default" }: { label: string; value: ReactNode; hint?: string; tone?: "default" | "good" | "bad" | "warn" }) {
  return (
    <div className="card p-4">
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className={clsx("mt-1.5 text-2xl font-semibold tabular-nums",
        tone === "good" && "text-emerald-600", tone === "bad" && "text-red-600", tone === "warn" && "text-amber-600")}>{value}</div>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </div>
  );
}

const tones: Record<string, string> = {
  active: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  published: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  ok: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  scheduled: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  queued: "bg-sky-50 text-sky-700 ring-sky-200",
  publishing: "bg-sky-50 text-sky-700 ring-sky-200",
  draft: "bg-gray-50 text-gray-600 ring-gray-200",
  paused: "bg-amber-50 text-amber-700 ring-amber-200",
  rate_limited: "bg-amber-50 text-amber-700 ring-amber-200",
  warn: "bg-amber-50 text-amber-700 ring-amber-200",
  unknown: "bg-gray-50 text-gray-600 ring-gray-200",
  cancelled: "bg-gray-50 text-gray-500 ring-gray-200",
  completed: "bg-gray-50 text-gray-600 ring-gray-200",
  failed: "bg-red-50 text-red-700 ring-red-200",
  error: "bg-red-50 text-red-700 ring-red-200",
  auth_error: "bg-red-50 text-red-700 ring-red-200",
  disconnected: "bg-gray-100 text-gray-500 ring-gray-200",
  info: "bg-sky-50 text-sky-700 ring-sky-200",
  debug: "bg-gray-50 text-gray-500 ring-gray-200",
};

const labels: Record<string, string> = {
  active: "Активний", published: "Опубліковано", scheduled: "Заплановано", queued: "У черзі", publishing: "Публікується",
  draft: "Чернетка", paused: "Призупинено", rate_limited: "Ліміт", cancelled: "Скасовано", failed: "Помилка",
  auth_error: "Потрібна авторизація", disconnected: "Відключено", ok: "Доступно", error: "Помилка", unknown: "Не перевірено",
  completed: "Завершено", warn: "warn", info: "info", debug: "debug",
};

export function Badge({ status, children }: { status: string; children?: ReactNode }) {
  return (
    <span className={clsx("inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset", tones[status] ?? tones.unknown)}>
      {children ?? labels[status] ?? status}
    </span>
  );
}

export function Empty({ title, text, action }: { title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="text-sm font-medium">{title}</div>
      {text && <p className="mt-1 max-w-md text-sm text-muted">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Avatar({ url, name, size = 32 }: { url?: string | null; name: string; size?: number }) {
  return url
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={url} alt="" width={size} height={size} className="rounded-full object-cover" style={{ width: size, height: size }} />
    : <div className="flex items-center justify-center rounded-full bg-gray-200 text-xs font-semibold text-gray-600" style={{ width: size, height: size }}>
        {name.slice(0, 2).toUpperCase()}
      </div>;
}

export function fmtDate(s?: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleString("uk-UA", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Kyiv" });
}
