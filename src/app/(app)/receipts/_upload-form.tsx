"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export type EntityOpt = { id: string; name: string };

export function ReceiptUploadForm({
  entities,
  defaultEntityId,
}: {
  entities: EntityOpt[];
  defaultEntityId: string;
}) {
  const [entityId, setEntityId] = useState(defaultEntityId);
  const [busy, startTransition] = useTransition();
  const [busyState, setBusyState] = useState(false);
  const [result, setResult] = useState<
    | null
    | { ok: true; merchant: string | null; matched: boolean }
    | { ok: false; error: string }
  >(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  async function submit(formData: FormData) {
    formData.set("entityId", entityId);
    setBusyState(true);
    setResult(null);
    try {
      const res = await fetch("/receipts/upload", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({ error: "upload failed" }));
        setResult({ ok: false, error: j.error ?? "upload failed" });
        return;
      }
      const j = await res.json();
      setResult({
        ok: true,
        merchant: j.classification?.merchant ?? null,
        matched: !!j.matchedTransactionId,
      });
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    } catch (e) {
      setResult({ ok: false, error: String(e) });
    } finally {
      setBusyState(false);
    }
  }

  return (
    <div className="space-y-4">
      {result?.ok === true && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
          Uploaded
          {result.merchant ? ` · ${result.merchant}` : ""}
          {result.matched ? " · auto-matched to a transaction." : " · awaiting txn match."}
        </div>
      )}
      {result?.ok === false && (
        <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200">
          {result.error}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          startTransition(() => {
            submit(fd);
          });
        }}
        className="space-y-3"
      >
        <Field label="Entity">
          <select
            name="entityId"
            value={entityId}
            onChange={(e) => setEntityId(e.currentTarget.value)}
            className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-base"
          >
            {entities.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Receipt (photo or PDF)">
          <input
            ref={fileRef}
            type="file"
            name="file"
            accept="image/*,application/pdf,.pdf,.jpg,.jpeg,.png,.webp,.heic"
            required
            className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
          />
        </Field>

        <button
          type="submit"
          disabled={busy || busyState}
          className="w-full rounded-md bg-[var(--foreground)] py-3 text-base font-medium text-[var(--background)] disabled:opacity-50"
        >
          {busy || busyState ? "Classifying…" : "Upload & classify"}
        </button>
        <div className="text-xs text-[var(--muted)]">
          Claude reads merchant / date / total / tax / tip and auto-matches to
          a transaction within ±$0.50 / ±5 days.
        </div>
      </form>
    </div>
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
    <label className="block space-y-1">
      <span className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
        {label}
      </span>
      {children}
    </label>
  );
}
