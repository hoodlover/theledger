"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import {
  confirmTransfer,
  deleteTransfer,
  createStandingRule,
  toggleStandingRule,
  deleteStandingRule,
} from "./_actions";
import { Money, StatusPill } from "@/components/ui";

const PURPOSES = ["rent", "cleaning", "loan", "reimbursement", "other"] as const;
type Purpose = (typeof PURPOSES)[number];

export function CandidateRow({
  candidate,
}: {
  candidate: {
    fromTxnId: string;
    fromEntity: string;
    fromAccount: string;
    fromDate: string;
    fromMerchant: string | null;
    toTxnId: string;
    toEntity: string;
    toAccount: string;
    toDate: string;
    toMerchant: string | null;
    amountCents: number;
    dateDiffDays: number;
  };
}) {
  const c = candidate;
  const [purpose, setPurpose] = useState<Purpose>("rent");
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <div className="text-sm text-[var(--muted)]">
        Confirmed — refresh to clear.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="text-sm">
          <Link
            href={`/transactions?txn=${c.fromTxnId}`}
            className="font-medium hover:underline"
          >
            {c.fromEntity}
          </Link>{" "}
          <span className="text-[var(--muted)]">{c.fromDate}</span>{" "}
          <span className="text-[var(--muted)]">
            · {c.fromMerchant ?? "—"}
          </span>
          <div className="text-xs text-[var(--muted)]">{c.fromAccount}</div>
        </div>
        <span className="text-[var(--muted)]">→</span>
        <div className="text-sm text-right">
          <Link
            href={`/transactions?txn=${c.toTxnId}`}
            className="font-medium hover:underline"
          >
            {c.toEntity}
          </Link>{" "}
          <span className="text-[var(--muted)]">{c.toDate}</span>{" "}
          <span className="text-[var(--muted)]">· {c.toMerchant ?? "—"}</span>
          <div className="text-xs text-[var(--muted)]">{c.toAccount}</div>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm">
          <Money cents={c.amountCents} />
          <StatusPill tone="neutral">
            {c.dateDiffDays === 0
              ? "same day"
              : `${c.dateDiffDays}d apart`}
          </StatusPill>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={purpose}
            onChange={(e) => setPurpose(e.currentTarget.value as Purpose)}
            className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-sm"
          >
            {PURPOSES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await confirmTransfer(c.fromTxnId, c.toTxnId, purpose);
                setDone(true);
              })
            }
            className="rounded-md bg-[var(--foreground)] px-3 py-1 text-sm font-medium text-[var(--background)] disabled:opacity-50"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

export function NewStandingRule({
  entities,
}: {
  entities: { id: string; name: string }[];
}) {
  const [fromEntityId, setFrom] = useState(entities[0]?.id ?? "");
  const [toEntityId, setTo] = useState(entities[1]?.id ?? "");
  const [cadence, setCadence] = useState<"monthly" | "semi_monthly" | "annual">("monthly");
  const [amount, setAmount] = useState<string>("");
  const [purpose, setPurpose] = useState<Purpose>("rent");
  const [notes, setNotes] = useState<string>("");
  const [pending, startTransition] = useTransition();

  const dollars = Number(amount);
  const cents = Number.isFinite(dollars) && dollars > 0 ? Math.round(dollars * 100) : null;
  const valid = !!fromEntityId && !!toEntityId && fromEntityId !== toEntityId;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid) return;
        startTransition(async () => {
          await createStandingRule({
            fromEntityId,
            toEntityId,
            cadence,
            defaultAmountCents: cents,
            purpose,
            notes: notes || null,
          });
          setAmount("");
          setNotes("");
        });
      }}
      className="space-y-3"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="From entity">
          <select
            value={fromEntityId}
            onChange={(e) => setFrom(e.currentTarget.value)}
            className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-sm"
          >
            {entities.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="To entity">
          <select
            value={toEntityId}
            onChange={(e) => setTo(e.currentTarget.value)}
            className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-sm"
          >
            {entities.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Cadence">
          <select
            value={cadence}
            onChange={(e) => setCadence(e.currentTarget.value as typeof cadence)}
            className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-sm"
          >
            <option value="monthly">monthly</option>
            <option value="semi_monthly">semi-monthly</option>
            <option value="annual">annual</option>
          </select>
        </Field>
        <Field label="Purpose">
          <select
            value={purpose}
            onChange={(e) => setPurpose(e.currentTarget.value as Purpose)}
            className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-sm"
          >
            {PURPOSES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Amount $ (optional)">
          <input
            type="number"
            step="0.01"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.currentTarget.value)}
            placeholder="4000.00"
            className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-sm tabular"
          />
        </Field>
      </div>
      <Field label="Notes (optional)">
        <input
          value={notes}
          onChange={(e) => setNotes(e.currentTarget.value)}
          className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-sm"
        />
      </Field>
      <div className="flex justify-between">
        {!valid && fromEntityId === toEntityId && (
          <span className="text-xs text-amber-700">
            From and To must differ
          </span>
        )}
        <button
          type="submit"
          disabled={pending || !valid}
          className="ml-auto rounded-md bg-[var(--foreground)] px-3 py-1.5 text-sm font-medium text-[var(--background)] disabled:opacity-50"
        >
          Add rule
        </button>
      </div>
    </form>
  );
}

export function StandingRuleRow({
  rule,
  fromEntity,
  toEntity,
}: {
  rule: {
    id: string;
    cadence: string;
    purpose: string;
    defaultAmountCents: number | null;
    active: boolean;
    notes: string | null;
  };
  fromEntity: string;
  toEntity: string;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="text-sm">
        <span className="font-medium">{fromEntity}</span>{" "}
        <span className="text-[var(--muted)]">→</span>{" "}
        <span className="font-medium">{toEntity}</span>{" "}
        <StatusPill tone={rule.active ? "success" : "neutral"}>
          {rule.active ? "active" : "paused"}
        </StatusPill>{" "}
        <StatusPill tone="accent">{rule.purpose}</StatusPill>{" "}
        <StatusPill tone="neutral">{rule.cadence.replace("_", "-")}</StatusPill>
        {rule.defaultAmountCents != null && (
          <span className="ml-2 tabular text-[var(--muted)]">
            <Money cents={rule.defaultAmountCents} />
          </span>
        )}
        {rule.notes && (
          <div className="mt-1 text-xs text-[var(--muted)]">{rule.notes}</div>
        )}
      </div>
      <div className="flex gap-2 text-xs">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await toggleStandingRule(rule.id, !rule.active);
            })
          }
          className="rounded-md border border-[var(--border)] px-2 py-1 hover:bg-[var(--surface)]"
        >
          {rule.active ? "Pause" : "Resume"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (!confirm("Delete this standing rule?")) return;
            startTransition(async () => {
              await deleteStandingRule(rule.id);
            });
          }}
          className="rounded-md border border-[var(--border)] px-2 py-1 text-[var(--muted)] hover:text-[var(--danger,oklch(0.62_0.21_22))]"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

export function ConfirmedRow({
  transferId,
  fromEntity,
  toEntity,
  occurredOn,
  amountCents,
  purpose,
  notes,
  fromTxnId,
  toTxnId,
}: {
  transferId: string;
  fromEntity: string;
  toEntity: string;
  occurredOn: string;
  amountCents: number;
  purpose: string;
  notes: string | null;
  fromTxnId: string | null;
  toTxnId: string | null;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-3">
      <div className="text-sm">
        <span className="tabular text-[var(--muted)]">{occurredOn}</span>{" "}
        <span className="font-medium">{fromEntity}</span>{" "}
        <span className="text-[var(--muted)]">→</span>{" "}
        <span className="font-medium">{toEntity}</span>{" "}
        <Money cents={amountCents} />{" "}
        <StatusPill tone="accent">{purpose}</StatusPill>
        {notes && (
          <div className="mt-1 text-xs text-[var(--muted)]">{notes}</div>
        )}
        <div className="mt-1 text-xs">
          {fromTxnId && (
            <Link href={`/transactions?txn=${fromTxnId}`} className="hover:underline text-[var(--muted)]">
              from-side txn
            </Link>
          )}
          {fromTxnId && toTxnId && <span className="text-[var(--muted)]"> · </span>}
          {toTxnId && (
            <Link href={`/transactions?txn=${toTxnId}`} className="hover:underline text-[var(--muted)]">
              to-side txn
            </Link>
          )}
        </div>
      </div>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!confirm("Unlink this transfer? Both sides return to the candidate pool.")) return;
          startTransition(async () => {
            await deleteTransfer(transferId);
          });
        }}
        className="text-xs text-[var(--muted)] hover:text-[var(--danger,oklch(0.62_0.21_22))] disabled:opacity-50"
      >
        Unlink
      </button>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
        {label}
      </span>
      {children}
    </label>
  );
}
