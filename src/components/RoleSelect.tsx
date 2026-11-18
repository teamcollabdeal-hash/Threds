"use client";
import { useTransition } from "react";
import { setUserRole } from "@/app/actions/settings";

export function RoleSelect({ userId, role }: { userId: string; role: string }) {
  const [p, start] = useTransition();
  return (
    <select defaultValue={role} disabled={p} className="input w-32 py-1 text-xs"
      onChange={(e) => start(() => setUserRole(userId, e.target.value as any))}>
      <option value="admin">admin</option><option value="editor">editor</option><option value="viewer">viewer</option><option value="pending">без доступу</option>
    </select>
  );
}
