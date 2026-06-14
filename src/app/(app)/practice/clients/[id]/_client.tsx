"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addNote,
  changeClientStatus,
  createStandingSchedule,
  endStandingSchedule,
} from "../../_crm-actions";
import { reassignCounselor } from "../../_actions";
import type { PracticeClientStatus } from "@/lib/db/schema";

const DAY_LABEL = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

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

export type StandingScheduleItem = {
  id: string;
  counselorId: string;
  counselorName: string;
  dayOfWeek: number;
  timeOfDay: string;
  durationMinutes: number;
  weeksInterval: number;
  startedOn: string;
  feeCents: number | null;
};

export function StandingScheduleBox({
  entityId,
  clientId,
  schedules,
  counselors,
}: {
  entityId: string;
  clientId: string;
  schedules: StandingScheduleItem[];
  counselors: { id: string; display: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    const fd = new FormData(e.currentTarget);
    fd.set("entityId", entityId);
    fd.set("clientId", clientId);
    setBusy(true);
    try {
      const res = await createStandingSchedule(fd);
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

  async function onEnd(id: string, label: string) {
    if (!confirm(`End standing schedule for ${label}? Stops future session generation.`)) return;
    setBusy(true);
    try {
      await endStandingSchedule(id);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {schedules.length === 0 ? (
        <p className="text-xs text-[var(--muted)] italic">No standing schedule.</p>
      ) : (
        <ul className="space-y-1.5 text-xs">
          {schedules.map((s) => (
            <li
              key={s.id}
              className="flex items-baseline justify-between gap-2 rounded-md border border-[var(--border)] bg-[var(--surface-warm)] px-2.5 py-2"
            >
              <div>
                <div className="font-semibold">
                  {DAY_LABEL[s.dayOfWeek]} {s.timeOfDay}
                </div>
                <div className="text-[10px] text-[var(--muted)] tabular">
                  {s.counselorName} · every {s.weeksInterval}w · {s.durationMinutes} min
                  {s.feeCents != null && ` · $${(s.feeCents / 100).toFixed(0)}`}
                </div>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => onEnd(s.id, `${DAY_LABEL[s.dayOfWeek]} ${s.timeOfDay}`)}
                className="text-[var(--muted)] hover:text-[var(--danger)] text-xs disabled:opacity-50"
              >
                End
              </button>
            </li>
          ))}
        </ul>
      )}

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-full rounded-full border border-[var(--accent)] text-[var(--accent)] py-1.5 text-xs font-semibold hover:bg-[var(--color-sage-tint,#e8efe9)] transition-colors"
        >
          + Add standing slot
        </button>
      ) : (
        <form
          onSubmit={onCreate}
          className="space-y-2 rounded-md border border-[var(--border)] bg-[var(--surface-warm)] p-3"
        >
          <label className="block">
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
              Counselor
            </span>
            <select name="counselorId" required defaultValue="" className={input}>
              <option value="">— pick —</option>
              {counselors.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.display}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                Day
              </span>
              <select name="dayOfWeek" defaultValue="2" className={input}>
                {DAY_LABEL.map((d, i) => (
                  <option key={i} value={i}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                Time (HH:MM)
              </span>
              <input name="timeOfDay" required placeholder="15:00" className={input + " tabular"} />
            </label>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <label className="block">
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                Starts
              </span>
              <input
                type="date"
                name="startedOn"
                required
                defaultValue={new Date().toISOString().slice(0, 10)}
                className={input + " tabular"}
              />
            </label>
            <label className="block">
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                Every (w)
              </span>
              <input
                type="number"
                name="weeksInterval"
                min={1}
                max={8}
                defaultValue={1}
                className={input + " tabular"}
              />
            </label>
            <label className="block">
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                Mins
              </span>
              <input
                type="number"
                name="durationMinutes"
                min={15}
                max={180}
                step={5}
                defaultValue={50}
                className={input + " tabular"}
              />
            </label>
          </div>
          <label className="block">
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
              Fee cents (optional)
            </span>
            <input type="number" name="feeCents" min={0} step={100} className={input + " tabular"} />
          </label>
          {err && <div className="text-xs text-[var(--danger)]">{err}</div>}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busy}
              className="flex-1 rounded-full bg-[var(--accent)] py-1.5 text-xs font-semibold text-white disabled:opacity-50"
            >
              {busy ? "Adding…" : "Add"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-full border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--muted)]"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
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
