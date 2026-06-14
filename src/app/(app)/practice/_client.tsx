"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  logInquiry,
  logSession,
  toggleSessionFlag,
  resolveInboxEvent,
} from "./_actions";

export type CounselorOption = {
  id: string;
  display: string;
  feeKeepPercent: number | null;
};

export type ClientOption = {
  id: string;
  display: string;
};

const input =
  "w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm focus:bg-white focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20 transition-colors";

const fieldLabel =
  "text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]";

// ───────── Log inquiry button + drawer ─────────

export function LogInquiryButton({
  counselors,
}: {
  counselors: CounselorOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [createClient, setCreateClient] = useState(true);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    const fd = new FormData(e.currentTarget);
    fd.set("createClient", createClient ? "true" : "false");
    setBusy(true);
    try {
      const res = await logInquiry(fd);
      if (!res.ok) {
        setErr(res.error ?? "Failed");
        return;
      }
      setOpen(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white"
      >
        + Log inquiry
      </button>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-[#0f172a]/40 grid place-items-center p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-[0_24px_60px_rgba(15,23,42,0.30)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-baseline justify-between gap-3 mb-4">
              <h2 className="font-display text-xl">Log inquiry</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-[var(--muted)] hover:text-[var(--danger)]"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <form onSubmit={onSubmit} className="space-y-3">
              <label className="block space-y-1">
                <span className={fieldLabel}>Name (first + last; stored as initials)</span>
                <input name="name" required className={input} autoFocus />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block space-y-1">
                  <span className={fieldLabel}>Source</span>
                  <select name="source" defaultValue="email_inquiry" className={input}>
                    <option value="email_inquiry">Email</option>
                    <option value="dialpad_sms">Dialpad SMS</option>
                    <option value="dialpad_voicemail">Voicemail</option>
                    <option value="referral">Referral</option>
                    <option value="walkin">Walk-in</option>
                    <option value="manual">Other</option>
                  </select>
                </label>
                <label className="block space-y-1">
                  <span className={fieldLabel}>When (defaults to now)</span>
                  <input
                    type="datetime-local"
                    name="occurredAt"
                    className={input + " tabular"}
                  />
                </label>
              </div>
              <label className="block space-y-1">
                <span className={fieldLabel}>Counselor (optional)</span>
                <select name="counselorId" defaultValue="" className={input}>
                  <option value="">— unassigned —</option>
                  {counselors.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.display}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1">
                <span className={fieldLabel}>Notes (short — no clinical content)</span>
                <textarea
                  name="notes"
                  rows={3}
                  className={input}
                  placeholder="brief note, no PHI"
                />
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={createClient}
                  onChange={(e) => setCreateClient(e.currentTarget.checked)}
                  className="h-3.5 w-3.5"
                />
                <span>Create a client record now</span>
                <span className="text-xs text-[var(--muted)]">(uncheck to keep as untriaged inbox event)</span>
              </label>
              {err && <div className="text-xs text-[var(--danger)]">{err}</div>}
              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={busy}
                  className="flex-1 rounded-full bg-[var(--foreground)] py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {busy ? "Logging…" : "Log inquiry"}
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-full border border-[var(--border)] px-4 py-2 text-sm text-[var(--muted)]"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

// ───────── Log session button + drawer ─────────

export function LogSessionButton({
  counselors,
  clients,
}: {
  counselors: CounselorOption[];
  clients: ClientOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    try {
      const res = await logSession(fd);
      if (!res.ok) {
        setErr(res.error ?? "Failed");
        return;
      }
      setOpen(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-full border border-[var(--accent)] text-[var(--accent)] px-4 py-2 text-sm font-semibold hover:bg-[var(--color-sage-tint,#e8efe9)] transition-colors"
      >
        + Log session
      </button>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-[#0f172a]/40 grid place-items-center p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-[0_24px_60px_rgba(15,23,42,0.30)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-baseline justify-between gap-3 mb-4">
              <h2 className="font-display text-xl">Log session</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-[var(--muted)] hover:text-[var(--danger)]"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <form onSubmit={onSubmit} className="space-y-3">
              <label className="block space-y-1">
                <span className={fieldLabel}>Client (optional — leave blank for orphan)</span>
                <select name="clientId" defaultValue="" className={input}>
                  <option value="">— unmatched —</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.display}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1">
                <span className={fieldLabel}>Counselor</span>
                <select name="counselorId" required defaultValue="" className={input}>
                  <option value="">— select —</option>
                  {counselors.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.display}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block space-y-1">
                  <span className={fieldLabel}>Scheduled for</span>
                  <input
                    type="datetime-local"
                    name="scheduledFor"
                    required
                    className={input + " tabular"}
                  />
                </label>
                <label className="block space-y-1">
                  <span className={fieldLabel}>Completed (date, if held)</span>
                  <input type="date" name="completedAt" className={input + " tabular"} />
                </label>
              </div>
              <label className="block space-y-1">
                <span className={fieldLabel}>Fee (cents — e.g. 15000 for $150)</span>
                <input
                  type="number"
                  name="feeCents"
                  min={0}
                  step={100}
                  className={input + " tabular"}
                />
              </label>
              <div className="flex gap-4 text-sm">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" name="noShow" value="true" className="h-3.5 w-3.5" />
                  No-show
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" name="cancelled" value="true" className="h-3.5 w-3.5" />
                  Cancelled
                </label>
              </div>
              {err && <div className="text-xs text-[var(--danger)]">{err}</div>}
              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={busy}
                  className="flex-1 rounded-full bg-[var(--foreground)] py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {busy ? "Logging…" : "Log session"}
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-full border border-[var(--border)] px-4 py-2 text-sm text-[var(--muted)]"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

// ───────── One-click session flag toggle ─────────

export function SessionFlagButtons({
  sessionId,
  noShow,
  cancelled,
}: {
  sessionId: string;
  noShow: boolean;
  cancelled: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function flip(field: "noShow" | "cancelled", value: boolean) {
    startTransition(async () => {
      await toggleSessionFlag(sessionId, field, value);
      router.refresh();
    });
  }

  return (
    <div className="flex gap-1.5">
      <button
        type="button"
        disabled={pending}
        onClick={() => flip("noShow", !noShow)}
        className={[
          "rounded-full px-2.5 py-0.5 text-[10px] font-semibold transition-colors disabled:opacity-50",
          noShow
            ? "bg-[var(--danger)] text-white"
            : "border border-[var(--border)] text-[var(--muted)] hover:text-[var(--foreground)]",
        ].join(" ")}
      >
        No-show
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => flip("cancelled", !cancelled)}
        className={[
          "rounded-full px-2.5 py-0.5 text-[10px] font-semibold transition-colors disabled:opacity-50",
          cancelled
            ? "bg-[var(--foreground)] text-white"
            : "border border-[var(--border)] text-[var(--muted)] hover:text-[var(--foreground)]",
        ].join(" ")}
      >
        Cancelled
      </button>
    </div>
  );
}

// ───────── Resolve an inbox event ─────────

export function ResolveEventRow({
  eventId,
  clients,
  counselors,
  summary,
}: {
  eventId: string;
  clients: ClientOption[];
  counselors: CounselorOption[];
  summary: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [clientId, setClientId] = useState<string>("");
  const [newName, setNewName] = useState("");
  const [counselorId, setCounselorId] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onResolve() {
    setErr(null);
    setBusy(true);
    try {
      const res =
        mode === "existing"
          ? await resolveInboxEvent(eventId, { mode: "existing", clientId })
          : await resolveInboxEvent(eventId, {
              mode: "new",
              name: newName,
              counselorId: counselorId || null,
            });
      if (!res.ok) {
        setErr(res.error ?? "Failed");
        return;
      }
      setOpen(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm">{summary}</span>
        {!open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="text-xs font-semibold text-[var(--accent)] hover:underline"
          >
            Resolve →
          </button>
        )}
      </div>
      {open && (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-warm)] p-3 space-y-2">
          <div className="inline-flex rounded-full bg-white border border-[var(--border)] p-0.5 text-xs">
            {(["existing", "new"] as const).map((m) => (
              <button
                key={m}
                type="button"
                data-no-lift
                onClick={() => setMode(m)}
                className={[
                  "rounded-full px-3 py-1",
                  mode === m
                    ? "bg-[var(--foreground)] text-white font-semibold"
                    : "text-[var(--body)]",
                ].join(" ")}
              >
                {m === "existing" ? "Existing client" : "New client"}
              </button>
            ))}
          </div>
          {mode === "existing" ? (
            <select
              value={clientId}
              onChange={(e) => setClientId(e.currentTarget.value)}
              className={input}
            >
              <option value="">— pick a client —</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.display}
                </option>
              ))}
            </select>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              <input
                value={newName}
                onChange={(e) => setNewName(e.currentTarget.value)}
                placeholder="First Last (stored as initials)"
                className={input}
              />
              <select
                value={counselorId}
                onChange={(e) => setCounselorId(e.currentTarget.value)}
                className={input}
              >
                <option value="">— counselor (optional) —</option>
                {counselors.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.display}
                  </option>
                ))}
              </select>
            </div>
          )}
          {err && <div className="text-xs text-[var(--danger)]">{err}</div>}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy || (mode === "existing" ? !clientId : !newName.trim())}
              onClick={onResolve}
              className="rounded-full bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
            >
              {busy ? "Saving…" : "Resolve"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-full border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--muted)]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
