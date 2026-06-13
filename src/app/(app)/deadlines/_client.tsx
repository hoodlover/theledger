"use client";

import { useTransition } from "react";
import { markStatus, deleteDeadline } from "./_actions";

export function StatusActions({
  id,
  status,
}: {
  id: string;
  status: string;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-wrap gap-1 text-xs">
      {status !== "paid" && (
        <button
          type="button"
          disabled={pending}
          onClick={() => startTransition(async () => markStatus(id, "paid"))}
          className="rounded border border-[var(--border)] px-2 py-1 hover:bg-[var(--surface)]"
        >
          Mark paid
        </button>
      )}
      {status !== "scheduled" && status !== "paid" && (
        <button
          type="button"
          disabled={pending}
          onClick={() => startTransition(async () => markStatus(id, "scheduled"))}
          className="rounded border border-[var(--border)] px-2 py-1 hover:bg-[var(--surface)]"
        >
          Scheduled
        </button>
      )}
      {status !== "open" && (
        <button
          type="button"
          disabled={pending}
          onClick={() => startTransition(async () => markStatus(id, "open"))}
          className="rounded border border-[var(--border)] px-2 py-1 hover:bg-[var(--surface)]"
        >
          Reopen
        </button>
      )}
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!confirm("Delete this deadline?")) return;
          startTransition(async () => deleteDeadline(id));
        }}
        className="rounded border border-[var(--border)] px-2 py-1 text-[var(--muted)] hover:text-[var(--danger,oklch(0.62_0.21_22))]"
      >
        ×
      </button>
    </div>
  );
}
