"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  updateContractor,
  uploadW9,
  removeW9,
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
      <Field label="Role / title">
        <input
          value={state.role ?? ""}
          onChange={(e) => setState({ ...state, role: e.currentTarget.value || null })}
          placeholder="LPC, APC, Photographer, etc."
          className={input}
        />
      </Field>
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
}: {
  id: string;
  current: string | null;
}) {
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();
  const [result, setResult] = useState<
    | null
    | { ok: true; blobUrl: string }
    | { ok: false; error: string }
  >(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

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
      ) : (
        <div className="rounded-md border border-[#ecdcb1] bg-[#fbf6ea] px-3 py-2 text-sm text-[#7a5712]">
          No W-9 on file
        </div>
      )}

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
