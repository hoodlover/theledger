"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  updateContractor,
  uploadW9,
  removeW9,
  setW9OnFile,
  deleteContractor,
  tagTransactionsToContractor,
  uploadPaperwork,
  removePaperwork,
} from "./_actions";

const PAPERWORK_KINDS = [
  { id: "contract", label: "Contract" },
  { id: "offer_letter", label: "Offer letter" },
  { id: "supervision_agreement", label: "Supervision agreement" },
  { id: "malpractice_cert", label: "Malpractice cert" },
  { id: "direct_deposit_form", label: "Direct deposit form" },
  { id: "i9", label: "I-9" },
  { id: "nda", label: "NDA" },
  { id: "other", label: "Other" },
] as const;

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
        <Field label="Counselor %">
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

// ───────── Paperwork box ─────────

export type PaperworkItem = {
  id: string;
  kind: string;
  displayName: string;
  blobUrl: string;
  effectiveDate: string | null;
  expirationDate: string | null;
  createdAt: string;
};

function paperworkKindLabel(kind: string): string {
  return PAPERWORK_KINDS.find((k) => k.id === kind)?.label ?? kind;
}

export function PaperworkBox({
  contractorId,
  items,
}: {
  contractorId: string;
  items: PaperworkItem[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<string>("contract");
  const [displayName, setDisplayName] = useState("");
  const [effectiveDate, setEffectiveDate] = useState("");
  const [expirationDate, setExpirationDate] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    fd.set("contractorId", contractorId);
    setBusy(true);
    try {
      const res = await uploadPaperwork(fd);
      if (!res.ok) {
        setError(res.error ?? "Upload failed");
        return;
      }
      setOpen(false);
      setDisplayName("");
      setEffectiveDate("");
      setExpirationDate("");
      setKind("contract");
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function onRemove(id: string, label: string) {
    if (!confirm(`Remove "${label}"? The blob stays in storage.`)) return;
    setBusy(true);
    try {
      await removePaperwork(id);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {items.length === 0 ? (
        <div className="rounded-md border border-dashed border-[var(--border)] bg-[var(--surface-warm)] px-3 py-3 text-xs text-[var(--muted)]">
          No paperwork uploaded yet.
        </div>
      ) : (
        <ul className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)]">
          {items.map((it) => {
            const expired =
              it.expirationDate &&
              new Date(it.expirationDate) < new Date();
            return (
              <li key={it.id} className="flex items-baseline gap-2 px-3 py-2">
                <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--accent)] whitespace-nowrap shrink-0">
                  {paperworkKindLabel(it.kind)}
                </span>
                <div className="flex-1 min-w-0">
                  <a
                    href={it.blobUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium hover:underline truncate block"
                  >
                    {it.displayName}
                  </a>
                  {(it.effectiveDate || it.expirationDate) && (
                    <div className="text-[10px] text-[var(--muted)] tabular mt-0.5">
                      {it.effectiveDate && <>eff {it.effectiveDate}</>}
                      {it.effectiveDate && it.expirationDate && " · "}
                      {it.expirationDate && (
                        <span className={expired ? "text-[var(--danger)] font-semibold" : ""}>
                          exp {it.expirationDate}
                          {expired ? " (EXPIRED)" : ""}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onRemove(it.id, it.displayName)}
                  className="text-xs text-[var(--muted)] hover:text-[var(--danger)] disabled:opacity-50 shrink-0"
                  aria-label="Remove"
                >
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-full rounded-full border border-[var(--accent)] text-[var(--accent)] py-2 text-sm font-semibold hover:bg-[var(--color-sage-tint,#e8efe9)] transition-colors"
        >
          + Upload paperwork
        </button>
      ) : (
        <form onSubmit={onSubmit} className="space-y-2 rounded-lg border border-[var(--border)] bg-[var(--surface-warm)] p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                Kind
              </span>
              <select
                name="kind"
                value={kind}
                onChange={(e) => setKind(e.currentTarget.value)}
                className={input}
              >
                {PAPERWORK_KINDS.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                Display name
              </span>
              <input
                name="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.currentTarget.value)}
                placeholder="e.g. 2026 Contract"
                className={input}
              />
            </label>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                Effective
              </span>
              <input
                type="date"
                name="effectiveDate"
                value={effectiveDate}
                onChange={(e) => setEffectiveDate(e.currentTarget.value)}
                className={input + " tabular"}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                Expires
              </span>
              <input
                type="date"
                name="expirationDate"
                value={expirationDate}
                onChange={(e) => setExpirationDate(e.currentTarget.value)}
                className={input + " tabular"}
              />
            </label>
          </div>
          <label className="block space-y-1">
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
              File
            </span>
            <input
              ref={fileRef}
              type="file"
              name="file"
              accept="application/pdf,image/*"
              required
              className={input}
            />
          </label>
          {error && (
            <div className="text-xs text-[var(--danger)]">{error}</div>
          )}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busy}
              className="flex-1 rounded-full bg-[var(--accent)] py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {busy ? "Uploading…" : "Upload"}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setError(null);
              }}
              className="rounded-full border border-[var(--border)] px-4 py-2 text-sm text-[var(--muted)]"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
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
        Set a <strong>Counselor %</strong> in the contractor details above to see
        per-paycheck and per-month earnings breakdowns.
      </div>
    );
  }
  if (feeKeepPercent <= 0 || feeKeepPercent > 100) {
    return (
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-warm)] p-4 text-sm text-[var(--danger)]">
        Counselor % must be between 1 and 100.
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

// Quick keyboard-friendly picker to jump between contractors without
// going back to the index. Each option label includes entity in parens
// when scope is "all entities" so duplicate names are disambiguated.
export function ContractorPicker({
  currentId,
  options,
}: {
  currentId: string;
  options: { id: string; label: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <label className="inline-flex items-center gap-2">
      <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
        Jump to
      </span>
      <select
        value={currentId}
        disabled={pending}
        onChange={(e) => {
          const next = e.currentTarget.value;
          if (next === currentId) return;
          startTransition(() => router.push(`/contractors/${next}`));
        }}
        className="rounded-full border border-[var(--border)] bg-white px-3 py-1.5 text-sm font-medium hover:bg-[var(--surface-warm)] transition-colors min-w-[220px] disabled:opacity-50"
      >
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

// Untagged matches panel — surfaces transactions whose raw description
// hits all of the contractor's name-token prefixes (used when the bank
// truncates names, e.g. "JUAN DAVID MEJI" for Juan Mejia).
type MatchRow = {
  id: string;
  postedDate: string;
  amountCents: number;
  rawDescription: string;
  accountName: string;
};

export function UntaggedMatchesPanel({
  contractorId,
  contractorDisplay,
  matches,
  patternHint,
}: {
  contractorId: string;
  contractorDisplay: string;
  matches: MatchRow[];
  patternHint: string;
}) {
  const [busy, setBusy] = useState(false);
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const router = useRouter();

  const visible = matches.filter((m) => !skipped.has(m.id));
  if (visible.length === 0) return null;

  const ids = visible.map((m) => m.id);
  const totalCents = visible.reduce((s, m) => s + Math.abs(m.amountCents), 0);

  async function tagAll() {
    setBusy(true);
    try {
      const res = await tagTransactionsToContractor(contractorId, ids);
      router.refresh();
      alert(`Tagged ${res.updated} transaction${res.updated === 1 ? "" : "s"} to ${contractorDisplay}.`);
    } finally {
      setBusy(false);
    }
  }

  async function tagOne(id: string) {
    setBusy(true);
    try {
      await tagTransactionsToContractor(contractorId, [id]);
      setSkipped((s) => new Set(s).add(id));
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-[#cfe0d2] bg-[#eff5f0] p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3 mb-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#3a5a40]">
            Likely belongs to this contractor
          </div>
          <div className="text-sm text-[var(--body)] mt-1">
            {visible.length} untagged transaction
            {visible.length === 1 ? "" : "s"} match{" "}
            <span className="font-mono text-xs">{patternHint}</span> · totalling{" "}
            <strong>
              ${(totalCents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </strong>
          </div>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={tagAll}
          className="rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? "Tagging…" : `Tag all → ${contractorDisplay}`}
        </button>
      </div>

      <ul className="divide-y divide-[#cfe0d2] text-sm">
        {visible.map((m) => (
          <li
            key={m.id}
            className="py-2 flex items-baseline justify-between gap-3"
          >
            <span className="tabular text-xs text-[var(--muted)] w-20 shrink-0">
              {m.postedDate}
            </span>
            <div className="flex-1 min-w-0">
              <div className="font-mono text-xs truncate" title={m.rawDescription}>
                {m.rawDescription}
              </div>
              <div className="text-xs text-[var(--muted)]">{m.accountName}</div>
            </div>
            <span className="font-semibold tabular whitespace-nowrap">
              ${(Math.abs(m.amountCents) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <button
              type="button"
              disabled={busy}
              onClick={() => tagOne(m.id)}
              className="rounded-full border border-[var(--border)] px-2.5 py-1 text-[11px] font-semibold disabled:opacity-50"
            >
              Tag
            </button>
            <button
              type="button"
              onClick={() => setSkipped((s) => new Set(s).add(m.id))}
              className="text-[var(--muted)] hover:text-[var(--danger)] px-1.5 text-sm"
              aria-label="Hide from list"
              title="Not this contractor"
            >
              ×
            </button>
          </li>
        ))}
      </ul>
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
