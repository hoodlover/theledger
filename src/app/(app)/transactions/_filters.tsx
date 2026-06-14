"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { saveFilter, deleteFilter, type SavedFilter } from "./_saved-actions";

export type FilterAccount = { id: string; displayName: string };

// ───────── Date presets ─────────

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function qRange(year: number, q: 1 | 2 | 3 | 4) {
  const m = (q - 1) * 3;
  return { from: iso(new Date(Date.UTC(year, m, 1))), to: iso(new Date(Date.UTC(year, m + 3, 0))) };
}
function mRange(year: number, m: number) {
  return { from: iso(new Date(Date.UTC(year, m, 1))), to: iso(new Date(Date.UTC(year, m + 1, 0))) };
}

type Preset = { id: string; label: string; range: (now: Date) => { from: string; to: string } };

const PRESETS: Preset[] = [
  { id: "this-month", label: "This month", range: (n) => mRange(n.getUTCFullYear(), n.getUTCMonth()) },
  { id: "last-month", label: "Last month", range: (n) => {
      const m = n.getUTCMonth();
      const y = n.getUTCFullYear();
      return m === 0 ? mRange(y - 1, 11) : mRange(y, m - 1);
    } },
  { id: "this-q", label: "This Q", range: (n) => {
      const q = (Math.floor(n.getUTCMonth() / 3) + 1) as 1 | 2 | 3 | 4;
      return qRange(n.getUTCFullYear(), q);
    } },
  { id: "last-q", label: "Last Q", range: (n) => {
      const q = Math.floor(n.getUTCMonth() / 3) + 1;
      return q === 1 ? qRange(n.getUTCFullYear() - 1, 4) : qRange(n.getUTCFullYear(), (q - 1) as 1 | 2 | 3 | 4);
    } },
  { id: "ytd", label: "YTD", range: (n) => ({ from: `${n.getUTCFullYear()}-01-01`, to: iso(n) }) },
  { id: "last-year", label: "Last year", range: (n) => ({ from: `${n.getUTCFullYear() - 1}-01-01`, to: `${n.getUTCFullYear() - 1}-12-31` }) },
  { id: "py-q1", label: "PY Q1", range: (n) => qRange(n.getUTCFullYear() - 1, 1) },
  { id: "py-q2", label: "PY Q2", range: (n) => qRange(n.getUTCFullYear() - 1, 2) },
  { id: "py-q3", label: "PY Q3", range: (n) => qRange(n.getUTCFullYear() - 1, 3) },
  { id: "py-q4", label: "PY Q4", range: (n) => qRange(n.getUTCFullYear() - 1, 4) },
];

const inputClasses =
  "rounded-lg border border-[var(--border)] bg-[var(--surface-warm)] px-3 py-2 text-sm focus:bg-white focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20 transition-colors";

export function TransactionFilters({
  accounts,
  savedFilters,
}: {
  accounts: FilterAccount[];
  savedFilters: SavedFilter[];
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [saving, setSaving] = useState(false);
  const [saveName, setSaveName] = useState("");

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

  function applyPreset(p: Preset) {
    const r = p.range(new Date());
    update({ from: r.from, to: r.to });
  }

  function applySaved(s: SavedFilter) {
    const params = new URLSearchParams(s.queryString);
    params.delete("page");
    const qs = params.toString();
    startTransition(() => router.push(qs ? `/transactions?${qs}` : "/transactions"));
  }

  async function onSaveSubmit() {
    if (!saveName.trim()) return;
    const params = new URLSearchParams(sp.toString());
    params.delete("page");
    params.delete("txn");
    const qs = params.toString();
    await saveFilter(saveName.trim(), qs);
    setSaving(false);
    setSaveName("");
    router.refresh();
  }

  const hasFilters = !!(sp.get("account") || sp.get("from") || sp.get("to") || sp.get("q"));
  const activeFrom = sp.get("from") ?? "";
  const activeTo = sp.get("to") ?? "";
  const activePresetId = PRESETS.find((p) => {
    if (!activeFrom || !activeTo) return false;
    const r = p.range(new Date());
    return r.from === activeFrom && r.to === activeTo;
  })?.id;

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-white shadow-[0_8px_24px_rgba(15,23,42,0.04)] p-4 space-y-3">
      {/* ───── Date preset chips ───── */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)] mr-1">
          Period
        </span>
        {PRESETS.map((p) => {
          const active = activePresetId === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => applyPreset(p)}
              className={[
                "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                active
                  ? "border-[var(--foreground)] bg-[var(--foreground)] text-white"
                  : "border-[var(--border)] text-[var(--body)] hover:bg-[var(--surface-warm)]",
              ].join(" ")}
            >
              {p.label}
            </button>
          );
        })}
        {(activeFrom || activeTo) && (
          <button
            type="button"
            onClick={() => update({ from: "", to: "" })}
            className="rounded-full px-2.5 py-1 text-xs text-[var(--muted)] hover:text-[var(--danger)]"
          >
            × clear dates
          </button>
        )}
      </div>

      {/* ───── Saved filters chips ───── */}
      {savedFilters.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)] mr-1">
            Saved
          </span>
          {savedFilters.map((s) => (
            <span
              key={s.id}
              className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface-warm)] pl-2.5 pr-1 py-0.5 text-xs"
            >
              <button
                type="button"
                onClick={() => applySaved(s)}
                className="font-medium hover:text-[var(--accent)]"
              >
                {s.name}
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!confirm(`Delete saved filter "${s.name}"?`)) return;
                  await deleteFilter(s.id);
                  router.refresh();
                }}
                className="rounded-full px-1 text-[var(--muted)] hover:text-[var(--danger)]"
                aria-label="Delete"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {/* ───── Main filter form ───── */}
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
            key={`from-${activeFrom}`}
            defaultValue={activeFrom}
            className={inputClasses + " tabular"}
          />
        </Field>
        <Field label="To">
          <input
            type="date"
            name="to"
            key={`to-${activeTo}`}
            defaultValue={activeTo}
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
          <>
            <button
              type="button"
              onClick={() => router.push("/transactions")}
              className="rounded-full border border-[var(--border)] px-4 py-2 text-sm text-[var(--muted)] hover:bg-[var(--surface-warm)] hover:text-[var(--foreground)] transition-colors"
            >
              Clear
            </button>
            {!saving ? (
              <button
                type="button"
                onClick={() => setSaving(true)}
                className="rounded-full border border-[var(--accent)] text-[var(--accent)] px-4 py-2 text-sm font-semibold hover:bg-[var(--color-sage-tint,#e8efe9)] transition-colors"
              >
                ★ Save filter
              </button>
            ) : (
              <span className="inline-flex items-center gap-1">
                <input
                  autoFocus
                  value={saveName}
                  onChange={(e) => setSaveName(e.currentTarget.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      onSaveSubmit();
                    } else if (e.key === "Escape") {
                      setSaving(false);
                      setSaveName("");
                    }
                  }}
                  placeholder="filter name"
                  className={inputClasses}
                />
                <button
                  type="button"
                  onClick={onSaveSubmit}
                  disabled={!saveName.trim()}
                  className="rounded-full bg-[var(--accent)] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSaving(false);
                    setSaveName("");
                  }}
                  className="rounded-full px-3 py-2 text-xs text-[var(--muted)]"
                >
                  Cancel
                </button>
              </span>
            )}
          </>
        )}
      </form>
    </div>
  );
}

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
