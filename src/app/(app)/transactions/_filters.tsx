"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

export type FilterAccount = { id: string; displayName: string };

export function TransactionFilters({
  accounts,
}: {
  accounts: FilterAccount[];
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [pending, startTransition] = useTransition();

  function update(patch: Record<string, string | undefined>) {
    const params = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined || v === "") params.delete(k);
      else params.set(k, v);
    }
    if (Object.keys(patch).some((k) => k !== "page")) params.delete("page");
    const qs = params.toString();
    startTransition(() => router.push(qs ? `/transactions?${qs}` : "/transactions"));
  }

  const hasFilters = !!(sp.get("account") || sp.get("from") || sp.get("to") || sp.get("q"));

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-white shadow-[0_8px_24px_rgba(15,23,42,0.04)] p-4">
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          update({
            account: String(fd.get("account") || ""),
            from: String(fd.get("from") || ""),
            to: String(fd.get("to") || ""),
            q: String(fd.get("q") || ""),
          });
        }}
      >
        <Field label="Account">
          <select
            name="account"
            defaultValue={sp.get("account") ?? ""}
            onChange={(e) => update({ account: e.currentTarget.value })}
            className={inputClasses + " min-w-[240px]"}
          >
            <option value="">All accounts</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.displayName}
              </option>
            ))}
          </select>
        </Field>
        <Field label="From">
          <input
            type="date"
            name="from"
            defaultValue={sp.get("from") ?? ""}
            className={inputClasses + " tabular"}
          />
        </Field>
        <Field label="To">
          <input
            type="date"
            name="to"
            defaultValue={sp.get("to") ?? ""}
            className={inputClasses + " tabular"}
          />
        </Field>
        <Field label="Search">
          <input
            type="search"
            name="q"
            defaultValue={sp.get("q") ?? ""}
            placeholder="merchant, description, or amount"
            className={inputClasses + " min-w-[240px]"}
          />
        </Field>
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-[var(--foreground)] px-4 py-2 text-sm font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(15,23,42,0.20)] disabled:opacity-50 disabled:hover:translate-y-0"
        >
          Apply
        </button>
        {hasFilters && (
          <button
            type="button"
            onClick={() => router.push("/transactions")}
            className="rounded-full border border-[var(--border)] px-4 py-2 text-sm text-[var(--muted)] hover:bg-[var(--surface-warm)] hover:text-[var(--foreground)] transition-colors"
          >
            Clear
          </button>
        )}
      </form>
    </div>
  );
}

const inputClasses =
  "rounded-lg border border-[var(--border)] bg-[var(--surface-warm)] px-3 py-2 text-sm focus:bg-white focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20 transition-colors";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
        {label}
      </span>
      {children}
    </label>
  );
}
