"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addNote, changeClientStatus } from "../../_crm-actions";
import { reassignCounselor } from "../../_actions";
import type { PracticeClientStatus } from "@/lib/db/schema";

const STATUS_LABEL: Record<PracticeClientStatus, string> = {
  lead: "Lead",
  scheduling: "Scheduling",
  confirmed: "Confirmed",
  in_progress: "In progress",
  discharged: "Discharged",
  lost: "Lost",
};

const input =
  "w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm focus:bg-white focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20 transition-colors";

export function StatusSelect({
  clientId,
  current,
}: {
  clientId: string;
  current: PracticeClientStatus;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  return (
    <select
      value={current}
      disabled={pending}
      data-no-lift
      onChange={(e) => {
        const next = e.currentTarget.value as PracticeClientStatus;
        startTransition(async () => {
          await changeClientStatus(clientId, next);
          router.refresh();
        });
      }}
      className="rounded-full border border-[var(--accent)] bg-white px-3 py-1 text-sm font-semibold text-[var(--accent)] disabled:opacity-50"
    >
      {(
        ["lead", "scheduling", "confirmed", "in_progress", "discharged", "lost"] as const
      ).map((s) => (
        <option key={s} value={s}>
          {STATUS_LABEL[s]}
        </option>
      ))}
    </select>
  );
}

export function CounselorReassignSelect({
  clientId,
  current,
  counselors,
}: {
  clientId: string;
  current: string | null;
  counselors: { id: string; display: string }[];
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  return (
    <select
      value={current ?? ""}
      disabled={pending}
      data-no-lift
      onChange={(e) => {
        const v = e.currentTarget.value;
        if (!v) return;
        if (!confirm("Reassign this client to a new counselor?")) {
          e.currentTarget.value = current ?? "";
          return;
        }
        startTransition(async () => {
          await reassignCounselor(clientId, v);
          router.refresh();
        });
      }}
      className="rounded-full border border-[var(--border)] bg-white px-3 py-1 text-sm disabled:opacity-50"
    >
      <option value="">— pick a counselor —</option>
      {counselors.map((c) => (
        <option key={c.id} value={c.id}>
          {c.display}
        </option>
      ))}
    </select>
  );
}

export function NoteComposer({
  entityId,
  clientId,
}: {
  entityId: string;
  clientId: string;
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!body.trim()) return;
    setErr(null);
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("entityId", entityId);
      fd.set("clientId", clientId);
      fd.set("body", body);
      const res = await addNote(fd);
      if (!res.ok) {
        setErr(res.error ?? "Failed");
        return;
      }
      setBody("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-2">
      <textarea
        value={body}
        onChange={(e) => setBody(e.currentTarget.value)}
        rows={3}
        className={input}
        placeholder="Add a note. @mention to ping someone. No clinical content."
      />
      {err && <div className="text-xs text-[var(--danger)]">{err}</div>}
      <div className="flex justify-between items-baseline">
        <span className="text-[10px] text-[var(--muted)] italic">
          Internal-only. Minimal PHI rule applies.
        </span>
        <button
          type="submit"
          disabled={busy || !body.trim()}
          className="rounded-full bg-[var(--accent)] px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? "Posting…" : "Post note"}
        </button>
      </div>
    </form>
  );
}
