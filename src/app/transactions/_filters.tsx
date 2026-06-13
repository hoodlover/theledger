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
    // any filter change resets pagination
    if (Object.keys(patch).some((k) => k !== "page")) params.delete("page");
    const qs = params.toString();
    startTransition(() => router.push(qs ? `/transactions?${qs}` : "/transactions"));
  }

  return (
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
          className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-sm min-w-[220px]"
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
          className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-sm tabular"
        />
      </Field>
      <Field label="To">
        <input
          type="date"
          name="to"
          defaultValue={sp.get("to") ?? ""}
          className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-sm tabular"
        />
      </Field>
      <Field label="Search">
        <input
          type="search"
          name="q"
          defaultValue={sp.get("q") ?? ""}
          placeholder="merchant, description, or amount"
          className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-sm min-w-[200px]"
        />
      </Field>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-[var(--foreground)] px-3 py-1.5 text-sm font-medium text-[var(--background)] hover:opacity-90 disabled:opacity-50"
      >
        Apply
      </button>
      {(sp.get("account") || sp.get("from") || sp.get("to") || sp.get("q")) && (
        <button
          type="button"
          onClick={() => router.push("/transactions")}
          className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--muted)] hover:text-[var(--foreground)]"
        >
          Clear
        </button>
      )}
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
        {label}
      </span>
      {children}
    </label>
  );
}
