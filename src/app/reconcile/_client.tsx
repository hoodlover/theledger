"use client";

import { useTransition } from "react";
import Link from "next/link";
import { Money, StatusPill } from "@/components/ui";
import {
  linkReceiptToTxn,
  dismissReceipt,
  linkManualToTxn,
  dismissManualEntry,
} from "./_actions";

type Candidate = {
  id: string;
  postedDate: string;
  amountCents: number;
  merchant: string | null;
  raw: string;
  accountName: string;
};

// ───────── Receipt row ─────────

export function ReceiptCandidateCard({
  receipt,
  candidates,
}: {
  receipt: {
    id: string;
    merchant: string | null;
    purchaseDate: string | null;
    totalCents: number | null;
    entityName: string;
    blobUrl: string;
  };
  candidates: Candidate[];
}) {
  const [pending, startTransition] = useTransition();
  return (
    <div className="rounded-xl border border-[var(--border)] bg-white p-4 shadow-[0_4px_12px_rgba(15,23,42,0.04)]">
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <a
            href={receipt.blobUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold hover:underline"
          >
            {receipt.merchant ?? "(unknown merchant)"}
          </a>
          <div className="text-xs text-[var(--muted)] mt-0.5">
            {receipt.entityName}
            {receipt.purchaseDate ? ` · ${receipt.purchaseDate}` : ""}
          </div>
        </div>
        <div className="text-right shrink-0">
          <Money cents={receipt.totalCents} />
        </div>
      </div>

      {candidates.length === 0 ? (
        <div className="mt-3 flex items-center justify-between gap-2 text-xs text-[var(--muted)]">
          <span>No txn within ±$0.50 / ±5 days. Drop a statement or dismiss.</span>
          <DismissBtn pending={pending} onDismiss={() => startTransition(() => dismissReceipt(receipt.id))} />
        </div>
      ) : (
        <>
          <div className="mt-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
            Likely match{candidates.length > 1 ? "es" : ""}
          </div>
          <ul className="mt-1.5 space-y-1.5">
            {candidates.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between gap-3 rounded-md border border-[var(--border)] bg-[var(--surface-warm)] px-3 py-2 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="tabular text-xs text-[var(--muted)]">
                      {c.postedDate}
                    </span>
                    <span className="font-medium truncate">
                      {c.merchant ?? "—"}
                    </span>
                  </div>
                  <div className="text-xs text-[var(--muted)] truncate">
                    {c.accountName} · <span className="tabular">{c.raw.slice(0, 60)}</span>
                  </div>
                </div>
                <Money cents={c.amountCents} signed />
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    startTransition(() => linkReceiptToTxn(receipt.id, c.id))
                  }
                  className="rounded-full bg-[var(--foreground)] px-3 py-1 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
                >
                  Link
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-2 text-right">
            <DismissBtn pending={pending} onDismiss={() => startTransition(() => dismissReceipt(receipt.id))} />
          </div>
        </>
      )}
    </div>
  );
}

// ───────── Manual entry row ─────────

export function ManualCandidateCard({
  entry,
  candidates,
}: {
  entry: {
    id: string;
    date: string;
    amountCents: number;
    payeeText: string | null;
    notes: string | null;
    entityName: string;
    enteredBy: string;
  };
  candidates: Candidate[];
}) {
  const [pending, startTransition] = useTransition();
  return (
    <div className="rounded-xl border border-[var(--border)] bg-white p-4 shadow-[0_4px_12px_rgba(15,23,42,0.04)]">
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <div className="font-semibold">
            {entry.payeeText ?? "(no payee)"}
          </div>
          <div className="text-xs text-[var(--muted)] mt-0.5">
            {entry.entityName} · {entry.date} · by {entry.enteredBy}
          </div>
          {entry.notes && (
            <div className="text-xs text-[var(--muted)] mt-1 italic">{entry.notes}</div>
          )}
        </div>
        <div className="text-right shrink-0">
          <Money cents={entry.amountCents} signed />
        </div>
      </div>

      {candidates.length === 0 ? (
        <div className="mt-3 flex items-center justify-between gap-2 text-xs text-[var(--muted)]">
          <span>No txn within exact-amount / ±5 days. Awaiting next import or dismiss.</span>
          <DismissBtn
            pending={pending}
            onDismiss={() => {
              if (!confirm("Delete this manual entry?")) return;
              startTransition(() => dismissManualEntry(entry.id));
            }}
            label="Delete"
          />
        </div>
      ) : (
        <>
          <div className="mt-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
            Likely match{candidates.length > 1 ? "es" : ""}
          </div>
          <ul className="mt-1.5 space-y-1.5">
            {candidates.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between gap-3 rounded-md border border-[var(--border)] bg-[var(--surface-warm)] px-3 py-2 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="tabular text-xs text-[var(--muted)]">
                      {c.postedDate}
                    </span>
                    <span className="font-medium truncate">
                      {c.merchant ?? "—"}
                    </span>
                  </div>
                  <div className="text-xs text-[var(--muted)] truncate">
                    {c.accountName}
                  </div>
                </div>
                <Money cents={c.amountCents} signed />
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    startTransition(() => linkManualToTxn(entry.id, c.id))
                  }
                  className="rounded-full bg-[var(--foreground)] px-3 py-1 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
                >
                  Link
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-2 text-right">
            <DismissBtn
              pending={pending}
              onDismiss={() => {
                if (!confirm("Delete this manual entry?")) return;
                startTransition(() => dismissManualEntry(entry.id));
              }}
              label="Delete"
            />
          </div>
        </>
      )}
    </div>
  );
}

// ───────── Dismiss button ─────────

function DismissBtn({
  pending,
  onDismiss,
  label = "Dismiss",
}: {
  pending: boolean;
  onDismiss: () => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      disabled={pending}
      onClick={onDismiss}
      className="text-xs text-[var(--muted)] hover:text-[var(--danger)] disabled:opacity-50"
    >
      {label}
    </button>
  );
}
