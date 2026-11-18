"use client";
import { useState, useTransition } from "react";
import { testNetworkConfig } from "@/app/actions/network";

export function NetworkTestButton({ id }: { id: string }) {
  const [p, start] = useTransition();
  const [r, setR] = useState<string | null>(null);
  return (
    <button className="btn-ghost py-1 text-xs" disabled={p} title={r ?? ""}
      onClick={() => start(async () => { const x = await testNetworkConfig(id); setR(x.ok ? `${x.latency} мс` : "помилка"); })}>
      {p ? "Перевірка…" : r ?? "Перевірити"}
    </button>
  );
}
