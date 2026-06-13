"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DOC_KINDS } from "@/lib/doc-kinds";

export type EntityOpt = { id: string; slug: string; name: string };

export function DocumentUploadForm({
  entities,
  defaultEntityId,
}: {
  entities: EntityOpt[];
  defaultEntityId: string;
}) {
  const [entityId, setEntityId] = useState(defaultEntityId);
  const [docKind, setDocKind] = useState<string>("operating_agreement");
  const [filedDate, setFiledDate] = useState("");
  const [expiresDate, setExpiresDate] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<
    null | { ok: true; label: string } | { ok: false; error: string }
  >(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const fd = new FormData(e.currentTarget);
    fd.set("entityId", entityId);
    fd.set("docKind", docKind);
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/docs/upload", { method: "POST", body: fd });
      if (!res.ok) {
        const j = await res.json().catch(() => ({ error: "upload failed" }));
        setResult({ ok: false, error: j.error ?? "upload failed" });
        return;
      }
      const entityName = entities.find((x) => x.id === entityId)?.name ?? "entity";
      setResult({ ok: true, label: `Saved to ${entityName}` });
      if (fileRef.current) fileRef.current.value = "";
      setNotes("");
      setFiledDate("");
      setExpiresDate("");
      router.refresh();
    } catch (err) {
      setResult({ ok: false, error: String(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {result?.ok === true && (
        <div className="rounded-md border border-[#cfe0d2] bg-[#eff5f0] p-3 text-sm text-[#3a5a40]">
          {result.label}
        </div>
      )}
      {result?.ok === false && (
        <div className="rounded-md border border-[#ebcacb] bg-[#f5e8e9] p-3 text-sm text-[var(--danger)]">
          {result.error}
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Entity">
            <select
              value={entityId}
              onChange={(e) => setEntityId(e.currentTarget.value)}
              className={fieldClasses}
            >
              {entities.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Document kind">
            <select
              value={docKind}
              onChange={(e) => setDocKind(e.currentTarget.value)}
              className={fieldClasses}
            >
              {DOC_KINDS.map((k) => (
                <option key={k.kind} value={k.kind}>
                  {k.label} — {k.group}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="File (PDF, image, anything)">
          <input
            ref={fileRef}
            type="file"
            name="file"
            required
            className={fieldClasses}
          />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Filed / signed date (optional)">
            <input
              type="date"
              name="filedDate"
              value={filedDate}
              onChange={(e) => setFiledDate(e.currentTarget.value)}
              className={fieldClasses + " tabular"}
            />
          </Field>
          <Field label="Expires (optional)">
            <input
              type="date"
              name="expiresDate"
              value={expiresDate}
              onChange={(e) => setExpiresDate(e.currentTarget.value)}
              className={fieldClasses + " tabular"}
            />
          </Field>
        </div>

        <Field label="Notes (optional)">
          <input
            name="notes"
            value={notes}
            onChange={(e) => setNotes(e.currentTarget.value)}
            placeholder="Policy number, carrier, counterparty, etc."
            className={fieldClasses}
          />
        </Field>

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-full bg-[var(--foreground)] py-2.5 text-sm font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(15,23,42,0.20)] disabled:opacity-50 disabled:hover:translate-y-0"
        >
          {busy ? "Uploading…" : "Upload document"}
        </button>
      </form>
    </div>
  );
}

const fieldClasses =
  "w-full rounded-lg border border-[var(--border)] bg-[var(--surface-warm)] px-3 py-2 text-sm focus:bg-white focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20 transition-colors";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
        {label}
      </span>
      {children}
    </label>
  );
}
