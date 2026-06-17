"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DOC_KINDS } from "@/lib/doc-kinds";

export type EntityOpt = { id: string; slug: string; name: string };

type UploadResult =
  | { ok: true; label: string }
  | { ok: false; error: string };

type UploadProgress = {
  total: number;
  done: number;
  failed: number;
};

const BATCH_UPLOAD_LIMIT = 3;

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
  const [result, setResult] = useState<null | UploadResult>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const form = e.currentTarget;
    const files = Array.from(fileRef.current?.files ?? []);
    if (files.length === 0) {
      setResult({ ok: false, error: "Choose at least one file first." });
      return;
    }

    setBusy(true);
    setResult(null);
    setProgress({ total: files.length, done: 0, failed: 0 });

    const errors: string[] = [];
    let nextIndex = 0;

    try {
      const workers = Array.from(
        { length: Math.min(BATCH_UPLOAD_LIMIT, files.length) },
        async () => {
          while (nextIndex < files.length) {
            const file = files[nextIndex++];
            const fd = new FormData(form);
            fd.set("entityId", entityId);
            fd.set("docKind", docKind);
            fd.set("file", file);

            try {
              const res = await fetch("/docs/upload", {
                method: "POST",
                body: fd,
              });
              if (!res.ok) {
                const j = await res
                  .json()
                  .catch(() => ({ error: "upload failed" }));
                errors.push(`${file.name}: ${j.error ?? "upload failed"}`);
              }
            } catch (err) {
              errors.push(`${file.name}: ${String(err)}`);
            } finally {
              setProgress((current) =>
                current
                  ? {
                      ...current,
                      done: current.done + 1,
                      failed: errors.length,
                    }
                  : current
              );
            }
          }
        }
      );

      await Promise.all(workers);

      const entityName = entities.find((x) => x.id === entityId)?.name ?? "entity";
      if (errors.length > 0) {
        setResult({
          ok: false,
          error:
            errors.length === files.length
              ? `No files uploaded. ${errors[0]}`
              : `Uploaded ${files.length - errors.length} of ${
                  files.length
                } files to ${entityName}. ${errors[0]}`,
        });
      } else {
        setResult({
          ok: true,
          label: `Uploaded ${files.length} file${
            files.length === 1 ? "" : "s"
          } to ${entityName}`,
        });
        setNotes("");
        setFiledDate("");
        setExpiresDate("");
      }
      if (fileRef.current) fileRef.current.value = "";
      setSelectedFiles([]);
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

        <Field label="Files (PDF, image, anything)">
          <input
            ref={fileRef}
            type="file"
            name="file"
            multiple
            required
            onChange={(e) =>
              setSelectedFiles(Array.from(e.currentTarget.files ?? []))
            }
            className={fieldClasses}
          />
          <div className="text-xs text-[var(--muted)]">
            {selectedFiles.length > 0
              ? `${selectedFiles.length.toLocaleString()} file${
                  selectedFiles.length === 1 ? "" : "s"
                } selected`
              : "Choose one file or a whole batch. Large batches upload a few at a time."}
          </div>
        </Field>

        {progress && busy && (
          <div className="rounded-md border border-[var(--border)] bg-[var(--surface-warm)] p-3 text-xs text-[var(--muted)]">
            <div className="mb-2 flex justify-between gap-3">
              <span>
                Uploading {progress.done.toLocaleString()} of{" "}
                {progress.total.toLocaleString()}
              </span>
              {progress.failed > 0 && (
                <span className="text-[var(--danger)]">
                  {progress.failed.toLocaleString()} failed
                </span>
              )}
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white">
              <div
                className="h-full rounded-full bg-[var(--accent)] transition-all"
                style={{
                  width: `${Math.round((progress.done / progress.total) * 100)}%`,
                }}
              />
            </div>
          </div>
        )}

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
          {busy
            ? `Uploading ${progress?.done ?? 0}/${progress?.total ?? selectedFiles.length}…`
            : selectedFiles.length > 1
              ? `Upload ${selectedFiles.length.toLocaleString()} documents`
              : "Upload document"}
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
