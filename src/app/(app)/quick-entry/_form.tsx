"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { submitManualEntry } from "./_actions";

export type EntityOpt = { id: string; name: string };

export function QuickEntryForm({
  entities,
  defaultEntityId,
  todayISO,
}: {
  entities: EntityOpt[];
  defaultEntityId: string;
  todayISO: string;
}) {
  const [entityId, setEntityId] = useState(defaultEntityId);
  const [direction, setDirection] = useState<"out" | "in">("out");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayISO);
  const [payee, setPayee] = useState("");
  const [notes, setNotes] = useState("");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{
    matchedTransactionId: string | null;
    candidateCount: number;
    payeeShown: string;
  } | null>(null);

  const dollars = Number(amount);
  const valid =
    !!entityId &&
    !!date &&
    Number.isFinite(dollars) &&
    dollars > 0;

  function reset() {
    setAmount("");
    setPayee("");
    setNotes("");
    setResult(null);
  }

  return (
    <div className="space-y-4">
      {result && (
        <div
          className={`rounded-md border p-3 text-sm ${
            result.matchedTransactionId
              ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200"
              : result.candidateCount > 1
                ? "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200"
                : "border-[var(--border)] bg-[var(--surface)]"
          }`}
        >
          {result.matchedTransactionId ? (
            <>
              Saved &amp; auto-matched to an existing transaction.{" "}
              <Link
                href={`/transactions?txn=${result.matchedTransactionId}`}
                className="underline"
              >
                View
              </Link>
              .
            </>
          ) : result.candidateCount > 1 ? (
            <>
              Saved. {result.candidateCount} txns matched amount + date — pick
              one to link manually on /transactions.
            </>
          ) : (
            <>Saved. Sits unmatched until the next import lands a match.</>
          )}
          <button
            type="button"
            onClick={reset}
            className="ml-3 underline text-[var(--muted)]"
          >
            New entry
          </button>
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return;
          const signed =
            direction === "out"
              ? -Math.round(dollars * 100)
              : Math.round(dollars * 100);
          startTransition(async () => {
            const res = await submitManualEntry({
              entityId,
              amountCents: signed,
              date,
              payeeText: payee,
              notes,
            });
            setResult({
              matchedTransactionId: res.matchedTransactionId,
              candidateCount: res.candidateCount,
              payeeShown: payee || "—",
            });
          });
        }}
        className="space-y-4"
      >
        <Field label="Entity">
          <select
            value={entityId}
            onChange={(e) => setEntityId(e.currentTarget.value)}
            className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-base"
          >
            {entities.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Direction">
          <div className="grid grid-cols-2 gap-2">
            <DirectionToggle
              label="Paid out"
              active={direction === "out"}
              onClick={() => setDirection("out")}
            />
            <DirectionToggle
              label="Received"
              active={direction === "in"}
              onClick={() => setDirection("in")}
            />
          </div>
        </Field>

        <Field label="Amount">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-base text-[var(--muted)]">
              $
            </span>
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.currentTarget.value)}
              placeholder="0.00"
              className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] py-2 pl-7 pr-3 text-xl font-medium tabular"
              autoFocus
            />
          </div>
        </Field>

        <Field label="Date">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.currentTarget.value)}
            className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-base tabular"
          />
        </Field>

        <Field label="Payee / merchant (optional)">
          <input
            type="text"
            value={payee}
            onChange={(e) => setPayee(e.currentTarget.value)}
            placeholder="Home Depot / Bob's Lawn Care / etc."
            className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-base"
          />
        </Field>

        <Field label="Notes (optional)">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.currentTarget.value)}
            rows={2}
            placeholder="Cash refund, cleaning invoice, etc."
            className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-base"
          />
        </Field>

        <button
          type="submit"
          disabled={!valid || pending}
          className="w-full rounded-md bg-[var(--foreground)] py-3 text-base font-medium text-[var(--background)] disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save"}
        </button>
      </form>
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

function DirectionToggle({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border px-3 py-2 text-sm font-medium ${
        active
          ? "border-[var(--foreground)] bg-[var(--foreground)] text-[var(--background)]"
          : "border-[var(--border)] bg-[var(--surface)] text-[var(--muted)]"
      }`}
    >
      {label}
    </button>
  );
}
