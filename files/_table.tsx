"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Money, StatusPill } from "@/components/ui";
import {
  bulkTagContractor,
  bulkTagEmployee,
  bulkMarkTransfer,
  bulkSetNote,
} from "./_actions";

export type TableRow = {
  id: string;
  postedDate: string;
  amountCents: number;
  normalizedMerchant: string | null;
  rawDescription: string;
  accountName: string;
  entityName: string;
  contractorName: string | null;
  employeeName: string | null;
  employeeKind: string | null;
  isInterEntityTransfer: boolean;
  hasNotes: boolean;
};

export function TransactionTable({
  rows,
  showEntityColumn,
  baseQueryString,
}: {
  rows: TableRow[];
  showEntityColumn: boolean;
  baseQueryString: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const allOnPage = useMemo(() => rows.map((r) => r.id), [rows]);
  const allSelected = selected.size > 0 && allOnPage.every((id) => selected.has(id));
  const partialSelected = !allSelected && allOnPage.some((id) => selected.has(id));

  function toggle(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function toggleAll() {
    setSelected((s) => {
      if (allSelected) {
        const n = new Set(s);
        for (const id of allOnPage) n.delete(id);
        return n;
      } else {
        const n = new Set(s);
        for (const id of allOnPage) n.add(id);
        return n;
      }
    });
  }

  function openTxn(id: string) {
    const params = new URLSearchParams(baseQueryString);
    params.set("txn", id);
    startTransition(() => router.push(`/transactions?${params.toString()}`));
  }

  const ids = useMemo(() => Array.from(selected), [selected]);

  async function run(fn: () => Promise<{ updated: number } | void>, label: string) {
    setBusy(true);
    try {
      const res = await fn();
      const n = (res && "updated" in res ? res.updated : ids.length) || 0;
      setSelected(new Set());
      router.refresh();
      // best-effort confirmation; keep terse
      alert(`${label}: ${n} txn${n === 1 ? "" : "s"} updated.`);
    } finally {
      setBusy(false);
    }
  }

  async function onBulkContractor() {
    const name = prompt("Contractor legal name to apply to selected txns?");
    if (!name?.trim()) return;
    await run(() => bulkTagContractor(ids, name.trim()), "Tagged as contractor");
  }
  async function onBulkW2() {
    const name = prompt("W-2 employee legal name?");
    if (!name?.trim()) return;
    await run(() => bulkTagEmployee(ids, name.trim(), "standard_w2"), "Tagged as W-2");
  }
  async function onBulkKid() {
    const name = prompt("Minor child legal name?");
    if (!name?.trim()) return;
    await run(() => bulkTagEmployee(ids, name.trim(), "minor_child"), "Tagged as minor child");
  }
  async function onBulkTransfer(value: boolean) {
    await run(() => bulkMarkTransfer(ids, value), value ? "Marked transfer" : "Unmarked transfer");
  }
  async function onBulkNote() {
    const note = prompt("Note text (leave empty to clear):") ?? "";
    await run(() => bulkSetNote(ids, note), note.trim() ? "Note saved" : "Notes cleared");
  }

  return (
    <div className="overflow-x-auto">
      {selected.size > 0 && (
        <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-[var(--border)] bg-[var(--surface-warm)] px-5 py-2.5 text-xs">
          <span className="font-semibold text-[var(--foreground)]">
            {selected.size} selected
          </span>
          <span className="text-[var(--muted)]">·</span>
          <button
            type="button"
            disabled={busy}
            onClick={onBulkContractor}
            className="rounded-full bg-[var(--accent)] px-3 py-1 font-semibold text-white disabled:opacity-50"
          >
            Tag 1099
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onBulkW2}
            className="rounded-full border border-[var(--accent)] text-[var(--accent)] px-3 py-1 font-semibold disabled:opacity-50"
          >
            Tag W-2
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onBulkKid}
            className="rounded-full border border-[var(--accent)] text-[var(--accent)] px-3 py-1 font-semibold disabled:opacity-50"
          >
            Tag Kid
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onBulkTransfer(true)}
            className="rounded-full border border-[var(--border)] px-3 py-1 disabled:opacity-50"
          >
            Mark transfer
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onBulkTransfer(false)}
            className="rounded-full border border-[var(--border)] px-3 py-1 disabled:opacity-50"
          >
            Un-transfer
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onBulkNote}
            className="rounded-full border border-[var(--border)] px-3 py-1 disabled:opacity-50"
          >
            Set note
          </button>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="ml-auto text-[var(--muted)] hover:text-[var(--danger)] px-2"
          >
            Clear
          </button>
        </div>
      )}
      <table className="hidden md:table w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] text-left text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">
            <th className="px-3 py-3 font-semibold w-8">
              <input
                type="checkbox"
                checked={allSelected}
                ref={(el) => {
                  if (el) el.indeterminate = partialSelected;
                }}
                onChange={toggleAll}
                onClick={(e) => e.stopPropagation()}
                aria-label="Select all on page"
                className="h-3.5 w-3.5 cursor-pointer"
              />
            </th>
            <th className="px-5 py-3 font-semibold whitespace-nowrap">Date</th>
            <th className="px-5 py-3 font-semibold">Merchant</th>
            <th className="px-5 py-3 font-semibold">Description</th>
            <th className="px-5 py-3 font-semibold text-right whitespace-nowrap">
              Amount
            </th>
            <th className="px-5 py-3 font-semibold whitespace-nowrap">Account</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const isSel = selected.has(r.id);
            return (
              <tr
                key={r.id}
                onClick={() => openTxn(r.id)}
                className={`cursor-pointer border-b border-[var(--border)] last:border-0 transition-colors ${
                  isSel ? "bg-[var(--surface-warm)]" : "hover:bg-[var(--surface-warm)]"
                }`}
              >
                <td className="px-3 py-3.5 w-8" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={isSel}
                    onChange={() => toggle(r.id)}
                    aria-label="Select row"
                    className="h-3.5 w-3.5 cursor-pointer"
                  />
                </td>
                <td className="px-5 py-3.5 tabular whitespace-nowrap text-[var(--muted)]">
                  {r.postedDate}
                </td>
                <td className="px-5 py-3.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-medium text-[var(--foreground)]">
                      {r.normalizedMerchant ?? "—"}
                    </span>
                    <RowPills r={r} />
                  </div>
                </td>
                <td className="px-5 py-3.5 text-[var(--muted)] max-w-[320px]">
                  <span className="line-clamp-1" title={r.rawDescription}>
                    {r.rawDescription}
                  </span>
                </td>
                <td className="px-5 py-3.5 text-right whitespace-nowrap font-medium">
                  <Money cents={r.amountCents} signed />
                </td>
                <td className="px-5 py-3.5 whitespace-nowrap">
                  <div className="text-xs font-medium text-[var(--body)]">
                    {r.accountName}
                  </div>
                  {showEntityColumn && (
                    <div className="text-xs text-[var(--muted)]">{r.entityName}</div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Mobile: tappable card list (table is hidden below md) */}
      <ul className="md:hidden divide-y divide-[var(--border)]">
        {rows.map((r) => {
          const isSel = selected.has(r.id);
          return (
            <li key={r.id}>
              <div
                onClick={() => openTxn(r.id)}
                className={`flex gap-3 px-1 py-3 cursor-pointer transition-colors ${
                  isSel ? "bg-[var(--surface-warm)]" : "active:bg-[var(--surface-warm)]"
                }`}
              >
                <label
                  onClick={(e) => e.stopPropagation()}
                  className="flex items-start pt-0.5"
                >
                  <input
                    type="checkbox"
                    checked={isSel}
                    onChange={() => toggle(r.id)}
                    aria-label="Select row"
                    className="h-4 w-4 cursor-pointer"
                  />
                </label>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-medium text-[var(--foreground)] truncate">
                      {r.normalizedMerchant ?? "—"}
                    </span>
                    <span className="shrink-0 font-medium">
                      <Money cents={r.amountCents} signed />
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-xs text-[var(--muted)] tabular">
                    <span className="whitespace-nowrap">{r.postedDate}</span>
                    <span aria-hidden>·</span>
                    <span className="truncate">
                      {r.accountName}
                      {showEntityColumn ? ` · ${r.entityName}` : ""}
                    </span>
                  </div>
                  {r.rawDescription && (
                    <div
                      className="mt-0.5 line-clamp-1 text-xs text-[var(--muted)]"
                      title={r.rawDescription}
                    >
                      {r.rawDescription}
                    </div>
                  )}
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5 empty:hidden">
                    <RowPills r={r} />
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function RowPills({ r }: { r: TableRow }) {
  return (
    <>
      {r.contractorName && (
        <StatusPill tone="accent">1099 · {r.contractorName}</StatusPill>
      )}
      {r.employeeName && (
        <StatusPill tone="accent">
          {r.employeeKind === "minor_child" ? "Kid" : "W-2"} · {r.employeeName}
        </StatusPill>
      )}
      {r.isInterEntityTransfer && (
        <StatusPill tone="warning">Transfer</StatusPill>
      )}
      {r.hasNotes && <StatusPill tone="neutral">Note</StatusPill>}
    </>
  );
}
