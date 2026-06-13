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
          <tr className="border-b border-[var(--border)] text-left text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">
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
          {rows.map((r) => (
            <tr
              key={r.id}
              onClick={() => openTxn(r.id)}
              className="cursor-pointer border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface-warm)] transition-colors"
            >
              <td className="px-5 py-3.5 tabular whitespace-nowrap text-[var(--muted)]">
                {r.postedDate}
              </td>
              <td className="px-5 py-3.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-medium text-[var(--foreground)]">
                    {r.normalizedMerchant ?? "—"}
                  </span>
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
                  {r.hasNotes && <StatusPill tone="neutral">Note</StatusPill>}
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
          ))}
        </tbody>
      </table>
    </div>
  );
}
