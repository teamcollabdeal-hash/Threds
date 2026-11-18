"use client";
import { useState, useTransition } from "react";
import { checkQuota } from "@/app/actions/accounts";

export function QuotaButton({ accountId }: { accountId: string }) {
  const [r, setR] = useState<string | null>(null);
  const [p, start] = useTransition();
  return (
    <button className="btn-ghost py-1 text-xs" disabled={p} onClick={() => start(async () => {
      const q = await checkQuota(accountId);
      setR(q.error ? `Помилка: ${q.error}` : `Квота Threads: ${q.usage}/${q.total}`);
    })}>{p ? "Перевірка…" : r ?? "Перевірити квоту API"}</button>
  );
}
