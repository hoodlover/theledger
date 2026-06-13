"use client";

import { useTransition } from "react";
import { StatusPill } from "@/components/ui";
import { deleteDocument } from "./_actions";

export function DocRow({
  id,
  label,
  href,
  meta,
  expiringIn,
  notes,
}: {
  id: string;
  label: string;
  href: string;
  meta: string;
  expiringIn: number | null; // null = no expiry, negative = expired
  notes: string | null;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex items-start justify-between gap-3 px-5 py-3">
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="flex-1 min-w-0 group"
      >
        <div className="flex items-center gap-2">
          <span className="font-medium text-[var(--foreground)] group-hover:underline">
            {label}
          </span>
          {expiringIn !== null && expiringIn < 0 && (
            <StatusPill tone="danger">
              expired {Math.abs(expiringIn)}d ago
            </StatusPill>
          )}
          {expiringIn !== null && expiringIn >= 0 && expiringIn <= 60 && (
            <StatusPill tone="warning">expires in {expiringIn}d</StatusPill>
          )}
        </div>
        <div className="text-xs text-[var(--muted)] mt-0.5">{meta}</div>
        {notes && (
          <div className="text-xs text-[var(--muted)] mt-0.5 truncate">
            {notes}
          </div>
        )}
      </a>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!confirm("Delete this document? The blob stays in storage.")) return;
          startTransition(async () => {
            await deleteDocument(id);
          });
        }}
        className="text-xs text-[var(--muted)] hover:text-[var(--danger)] disabled:opacity-50"
      >
        ×
      </button>
    </div>
  );
}
