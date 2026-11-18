"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { LayoutDashboard, Users, FileText, CalendarDays, Megaphone, Upload, Network, ScrollText, Settings, AtSign } from "lucide-react";

const nav = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/accounts", label: "Accounts", icon: Users },
  { href: "/posts", label: "Posts", icon: FileText },
  { href: "/scheduler", label: "Scheduler", icon: CalendarDays },
  { href: "/campaigns", label: "Campaigns", icon: Megaphone },
  { href: "/bulk", label: "Bulk Upload", icon: Upload },
  { href: "/network", label: "Network Settings", icon: Network },
  { href: "/logs", label: "Logs", icon: ScrollText },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar({ email, role }: { email: string; role: string }) {
  const path = usePathname();
  return (
    <aside className="w-60 shrink-0 border-r border-line bg-white"><div className="sticky top-0 flex h-screen flex-col">
      <div className="flex items-center gap-2 px-5 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-white"><AtSign size={18} /></div>
        <div className="text-[15px] font-semibold tracking-tight">MultiThreads</div>
      </div>
      <nav className="flex-1 space-y-0.5 px-3">
        {nav.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? path === "/" : path.startsWith(href);
          return (
            <Link key={href} href={href} className={clsx("flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition",
              active ? "bg-canvas font-medium text-ink" : "text-muted hover:bg-canvas hover:text-ink")}>
              <Icon size={16} strokeWidth={1.8} />{label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-line px-5 py-4 text-xs">
        <div className="truncate font-medium">{email}</div>
        <div className="mt-0.5 flex items-center justify-between text-muted">
          <span className="capitalize">{role}</span>
          <form action="/auth/signout" method="post"><button className="hover:text-ink">Вийти</button></form>
        </div>
      </div>
    </div></aside>
  );
}
