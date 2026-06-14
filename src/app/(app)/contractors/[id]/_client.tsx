"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  updateContractor,
  uploadW9,
  removeW9,
  setW9OnFile,
  deleteContractor,
} from "./_actions";

const input =
  "w-full rounded-lg border border-[var(--border)] bg-[var(--surface-warm)] px-3 py-2 text-sm focus:bg-white focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20 transition-colors";

export function ContractorEditForm({
  id,
  initial,
}: {
  id: string;
  initial: {
    legalName: string;
    dba: string | null;
    role: string | null;
    address: string | null;
    einOrSsn: string | null;
    startedDate: string | null;
    endedDate: string | null;
    feeKeepPercent: number | null;
  };
}) {
  const [state, setState] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [deleting, startDelete] = useTransition();
  const router = useRouter();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          await updateContractor(id, state);
        });
      }}
      className="space-y-3"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Legal name (recipient on 1099)">
          <input
            value={state.legalName}
            onChange={(e) => setState({ ...state, legalName: e.currentTarget.value })}
            className={input}
          />
        </Field>
        <Field label="DBA / display name">
          <input
            value={state.dba ?? ""}
            onChange={(e) => setState({ ...state, dba: e.currentTarget.value || null })}
            className={input}
          />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
        <Field label="Role / title">
          <input
            value={state.role ?? ""}
            onChange={(e) => setState({ ...state, role: e.currentTarget.value || null })}
            placeholder="LPC, APC, Photographer, etc."
            className={input}
          />
        </Field>
        <Field label="Fee keep %">
          <div className="relative">
            <input
              type="number"
              min={0}
              max={100}
              step={1}
              value={state.feeKeepPercent ?? ""}
              onChange={(e) => {
                const raw = e.currentTarget.value;
                const n = raw === "" ? null : Number(raw);
                setState({ ...state, feeKeepPercent: n });
              }}
              placeholder="e.g. 70"
              className={input + " tabular pr-7"}
            />
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-[var(--muted)] pointer-events-none">
              %
            </span>
          </div>
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="TIN / EIN / SSN">
          <input
            value={state.einOrSsn ?? ""}
            onChange={(e) => setState({ ...state, einOrSsn: e.currentTarget.value || null })}
            placeholder="82-1116780 or 123-45-6789"
            className={input + " tabular"}
          />
        </Field>
        <Field label="Started date">
          <input
            type="date"
            value={state.startedDate ?? ""}
            onChange={(e) => setState({ ...state, startedDate: e.currentTarget.value || null })}
            className={input + " tabular"}
          />
        </Field>
      </div>
      <Field label="Address">
        <input
          value={state.address ?? ""}
          onChange={(e) => setState({ ...state, address: e.currentTarget.value || null })}
          placeholder="Street, City State ZIP"
          className={input}
        />
      </Field>
      <Field label="Ended date (if no longer active)">
        <input
          type="date"
          value={state.endedDate ?? ""}
          onChange={(e) => setState({ ...state, endedDate: e.currentTarget.value || null })}
          className={input + " tabular"}
        />
      </Field>
      <div className="flex justify-between gap-2 pt-1">
        <button
          type="button"
          disabled={deleting}
          onClick={() => {
            if (!confirm("Delete contractor? Tagged transactions remain but lose their contractor link.")) return;
            startDelete(async () => {
              await deleteContractor(id);
              router.push("/contractors");
            });
          }}
          className="rounded-full border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--muted)] hover:text-[var(--danger)] disabled:opacity-50"
        >
          {deleting ? "Deleting…" : "Delete contractor"}
        </button>
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-[var(--foreground)] px-5 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}

export function W9Uploader({
  id,
  current,
  onFile,
}: {
  id: string;
  current: string | null;
  onFile: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [toggling, startToggle] = useTransition();
  const [result, setResult] = useState<
    | null
    | { ok: true; blobUrl: string }
    | { ok: false; error: string }
  >(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const considered = onFile || !!current;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("contractorId", id);
    setBusy(true);
    setResult(null);
    try {
      const res = await uploadW9(fd);
      if (res.ok) {
        setResult({ ok: true, blobUrl: res.blobUrl! });
        if (fileRef.current) fileRef.current.value = "";
        router.refresh();
      } else {
        setResult({ ok: false, error: res.error ?? "upload failed" });
      }
    } catch (err) {
      setResult({ ok: false, error: String(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {current ? (
        <div className="flex items-center justify-between gap-3 rounded-md border border-[#cfe0d2] bg-[#eff5f0] px-3 py-2 text-sm">
          <a
            href={current}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#3a5a40] font-medium hover:underline truncate"
          >
            W-9 on file — open
          </a>
          <RemoveW9Btn id={id} />
        </div>
      ) : considered ? (
        <div className="rounded-md border border-[#cfe0d2] bg-[#eff5f0] px-3 py-2 text-sm text-[#3a5a40]">
          W-9 on file (no PDF uploaded)
        </div>
      ) : (
        <div className="rounded-md border border-[#ecdcb1] bg-[#fbf6ea] px-3 py-2 text-sm text-[#7a5712]">
          No W-9 on file
        </div>
      )}

      {/* On-file flag — flips independently of the doc upload */}
      <label className="flex items-center gap-2 text-xs text-[var(--body)] cursor-pointer select-none">
        <input
          type="checkbox"
          checked={onFile}
          disabled={toggling}
          onChange={(e) => {
            const next = e.currentTarget.checked;
            startToggle(async () => {
              await setW9OnFile(id, next);
              router.refresh();
            });
          }}
          className="h-3.5 w-3.5"
        />
        <span>
          W-9 on file
          <span className="text-[var(--muted)]"> — check this when you have it but haven&apos;t uploaded the PDF</span>
        </span>
      </label>

      {result?.ok === true && (
        <div className="text-xs text-[var(--accent)]">
          Uploaded — refreshed.
        </div>
      )}
      {result?.ok === false && (
        <div className="text-xs text-[var(--danger)]">{result.error}</div>
      )}

      <form onSubmit={onSubmit} className="space-y-2">
        <input
          ref={fileRef}
          type="file"
          name="file"
          accept="application/pdf,image/*"
          required
          className={input}
        />
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-full bg-[var(--foreground)] py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? "Uploading…" : current ? "Replace W-9" : "Upload W-9"}
        </button>
      </form>
    </div>
  );
}

function RemoveW9Btn({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!confirm("Remove W-9 link? The blob stays in storage.")) return;
        startTransition(async () => {
          await removeW9(id);
        });
      }}
      className="text-xs text-[var(--muted)] hover:text-[var(--danger)] disabled:opacity-50"
    >
      Remove
    </button>
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
    <label className="block space-y-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
        {label}
      </span>
      {children}
    </label>
  );
}

type Paycheck = {
  id: string;
  postedDate: string;
  amountCents: number; // negative — what we paid the counselor
};

// Render a switchable view: per-paycheck table or monthly rollup.
// Counselor keeps keepPct of the gross fee. We paid the counselor what
// they keep, so gross = paid / (keepPct/100) and PTC share = gross − paid.
export function CounselorEarnings({
  payments,
  feeKeepPercent,
  year,
}: {
  payments: Paycheck[];
  feeKeepPercent: number | null;
  year: number;
}) {
  const [view, setView] = useState<"paycheck" | "month">("paycheck");

  if (feeKeepPercent == null) {
    return (
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-warm)] p-4 text-sm text-[var(--muted)]">
        Set a <strong>Fee keep %</strong> in the contractor details above to see
        per-paycheck and per-month earnings breakdowns.
      </div>
    );
  }
  if (feeKeepPercent <= 0 || feeKeepPercent > 100) {
    return (
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-warm)] p-4 text-sm text-[var(--danger)]">
        Fee keep % must be between 1 and 100.
      </div>
    );
  }

  const keep = feeKeepPercent / 100;

  // Each payment: |amount| is what counselor received → that's their take.
  // Gross = take / keep, PTC share = gross − take.
  const rows = payments.map((p) => {
    const counselorTakeCents = Math.abs(p.amountCents);
    const grossCents = Math.round(counselorTakeCents / keep);
    const ptcShareCents = grossCents - counselorTakeCents;
    return {
      id: p.id,
      postedDate: p.postedDate,
      counselorTakeCents,
      grossCents,
      ptcShareCents,
    };
  });

  const totals = rows.reduce(
    (acc, r) => ({
      take: acc.take + r.counselorTakeCents,
      gross: acc.gross + r.grossCents,
      ptc: acc.ptc + r.ptcShareCents,
      n: acc.n + 1,
    }),
    { take: 0, gross: 0, ptc: 0, n: 0 }
  );

  // Monthly rollup
  const byMonth = new Map<
    string,
    { take: number; gross: number; ptc: number; n: number }
  >();
  for (const r of rows) {
    const k = r.postedDate.slice(0, 7); // YYYY-MM
    const cur = byMonth.get(k) ?? { take: 0, gross: 0, ptc: 0, n: 0 };
    cur.take += r.counselorTakeCents;
    cur.gross += r.grossCents;
    cur.ptc += r.ptcShareCents;
    cur.n += 1;
    byMonth.set(k, cur);
  }
  const months = [...byMonth.entries()].sort((a, b) =>
    a[0] < b[0] ? -1 : 1
  );

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-[var(--muted)]">
          Counselor keeps <strong>{feeKeepPercent}%</strong> of each session
          fee · {totals.n} paycheck{totals.n === 1 ? "" : "s"} in {year}
        </div>
        <div className="inline-flex rounded-full border border-[var(--border)] bg-[var(--surface-warm)] p-0.5 text-xs">
          {(["paycheck", "month"] as const).map((v) => {
            const active = view === v;
            return (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                data-no-lift
                className={[
                  "rounded-full px-3 py-1 transition-colors",
                  active
                    ? "bg-[var(--foreground)] text-white font-semibold"
                    : "text-[var(--body)] hover:text-[var(--foreground)]",
                ].join(" ")}
              >
                By {v}
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">
              <th className="px-4 py-3 font-semibold">
                {view === "paycheck" ? "Paycheck date" : "Month"}
              </th>
              <th className="px-4 py-3 font-semibold text-right whitespace-nowrap">
                Gross fee
              </th>
              <th className="px-4 py-3 font-semibold text-right whitespace-nowrap">
                Counselor ({feeKeepPercent}%)
              </th>
              <th className="px-4 py-3 font-semibold text-right whitespace-nowrap">
                PTC ({100 - feeKeepPercent}%)
              </th>
            </tr>
          </thead>
          <tbody>
            {view === "paycheck"
              ? rows.length === 0
                ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-4 text-center text-[var(--muted)]">
                      No payments tagged in {year}.
                    </td>
                  </tr>
                )
                : rows.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-[var(--border)] last:border-0"
                  >
                    <td className="px-4 py-3 tabular text-[var(--muted)] whitespace-nowrap">
                      {r.postedDate}
                    </td>
                    <td className="px-4 py-3 text-right tabular whitespace-nowrap font-medium">
                      ${(r.grossCents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3 text-right tabular whitespace-nowrap text-[var(--accent)]">
                      ${(r.counselorTakeCents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3 text-right tabular whitespace-nowrap text-[var(--body)]">
                      ${(r.ptcShareCents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))
              : months.length === 0
                ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-4 text-center text-[var(--muted)]">
                      No payments tagged in {year}.
                    </td>
                  </tr>
                )
                : months.map(([k, m]) => (
                  <tr
                    key={k}
                    className="border-b border-[var(--border)] last:border-0"
                  >
                    <td className="px-4 py-3 tabular whitespace-nowrap">
                      {formatMonth(k)}{" "}
                      <span className="text-[var(--muted)] text-xs">
                        · {m.n} pay
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular whitespace-nowrap font-medium">
                      ${(m.gross / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3 text-right tabular whitespace-nowrap text-[var(--accent)]">
                      ${(m.take / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3 text-right tabular whitespace-nowrap text-[var(--body)]">
                      ${(m.ptc / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
          </tbody>
          {(view === "paycheck" ? rows.length : months.length) > 0 && (
            <tfoot>
              <tr className="border-t-2 border-[var(--border-strong)] bg-[var(--surface-warm)]">
                <td className="px-4 py-3 font-semibold">
                  Total {year}
                </td>
                <td className="px-4 py-3 text-right tabular whitespace-nowrap font-semibold">
                  ${(totals.gross / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td className="px-4 py-3 text-right tabular whitespace-nowrap font-semibold text-[var(--accent)]">
                  ${(totals.take / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td className="px-4 py-3 text-right tabular whitespace-nowrap font-semibold">
                  ${(totals.ptc / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

function formatMonth(yyyyMm: string): string {
  const [y, m] = yyyyMm.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1, 1));
  return d.toLocaleString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}
