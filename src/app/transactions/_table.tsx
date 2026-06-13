"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Money, StatusPill } from "@/components/ui";

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

  function openTxn(id: string) {
    const params = new URLSearchParams(baseQueryString);
    params.set("txn", id);
    startTransition(() => router.push(`/transactions?${params.toString()}`));
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wide text-[var(--muted)]">
            <th className="px-3 py-2 whitespace-nowrap">Date</th>
            <th className="px-3 py-2">Merchant</th>
            <th className="px-3 py-2">Description</th>
            <th className="px-3 py-2 text-right whitespace-nowrap">Amount</th>
            <th className="px-3 py-2 whitespace-nowrap">Account</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.id}
              onClick={() => openTxn(r.id)}
              className="cursor-pointer border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface)]"
            >
              <td className="px-3 py-2 tabular whitespace-nowrap text-[var(--muted)]">
                {r.postedDate}
              </td>
              <td className="px-3 py-2 font-medium">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span>{r.normalizedMerchant ?? "—"}</span>
                  {r.contractorName && (
                    <StatusPill tone="accent">
                      1099 · {r.contractorName}
                    </StatusPill>
                  )}
                  {r.employeeName && (
                    <StatusPill tone="accent">
                      {r.employeeKind === "minor_child" ? "Kid" : "W-2"} ·{" "}
                      {r.employeeName}
                    </StatusPill>
                  )}
                  {r.isInterEntityTransfer && (
                    <StatusPill tone="warning">Transfer</StatusPill>
                  )}
                  {r.hasNotes && (
                    <StatusPill tone="neutral">Note</StatusPill>
                  )}
                </div>
              </td>
              <td className="px-3 py-2 text-[var(--muted)] max-w-[280px]">
                <span className="line-clamp-1" title={r.rawDescription}>
                  {r.rawDescription}
                </span>
              </td>
              <td className="px-3 py-2 text-right whitespace-nowrap">
                <Money cents={r.amountCents} signed />
              </td>
              <td className="px-3 py-2 whitespace-nowrap">
                <div className="text-xs">{r.accountName}</div>
                {showEntityColumn && (
                  <div className="text-xs text-[var(--muted)]">
                    {r.entityName}
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
