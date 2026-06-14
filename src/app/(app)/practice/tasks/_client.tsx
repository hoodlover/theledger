"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  createTask,
  updateTaskStatus,
  reassignTask,
} from "../_crm-actions";

type TaskRow = {
  id: string;
  title: string;
  body: string | null;
  status: string;
  priority: string;
  dueAt: string | null;
  assignedToUserId: string | null;
  assignedToName: string | null;
  clientId: string | null;
  clientDisplay: string | null;
  createdByName: string | null;
};

const input =
  "w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm focus:bg-white focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20 transition-colors";
const fieldLabel =
  "text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]";

const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  in_progress: "In progress",
  waiting: "Waiting",
  done: "Done",
  wont_do: "Won't do",
};

export function NewTaskButton({
  entityId,
  users,
  clients,
}: {
  entityId: string;
  users: { id: string; name: string }[];
  clients: { id: string; display: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    const fd = new FormData(e.currentTarget);
    fd.set("entityId", entityId);
    setBusy(true);
    try {
      const res = await createTask(fd);
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
        + New task
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
              <h2 className="font-display text-xl">New task</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-[var(--muted)] hover:text-[var(--danger)]"
              >
                ×
              </button>
            </div>
            <form onSubmit={onSubmit} className="space-y-3">
              <label className="block space-y-1">
                <span className={fieldLabel}>Title</span>
                <input
                  name="title"
                  required
                  autoFocus
                  className={input}
                  placeholder="e.g. Confirm Tuesday 3pm with S.M."
                />
              </label>
              <label className="block space-y-1">
                <span className={fieldLabel}>Body (optional)</span>
                <textarea name="body" rows={3} className={input} />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block space-y-1">
                  <span className={fieldLabel}>Assign to</span>
                  <select name="assignedToUserId" defaultValue="" className={input}>
                    <option value="">— unassigned —</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block space-y-1">
                  <span className={fieldLabel}>Client (optional)</span>
                  <select name="clientId" defaultValue="" className={input}>
                    <option value="">— none —</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.display}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block space-y-1">
                  <span className={fieldLabel}>Due (optional)</span>
                  <input
                    type="datetime-local"
                    name="dueAt"
                    className={input + " tabular"}
                  />
                </label>
                <label className="block space-y-1">
                  <span className={fieldLabel}>Priority</span>
                  <select name="priority" defaultValue="normal" className={input}>
                    <option value="low">Low</option>
                    <option value="normal">Normal</option>
                    <option value="high">High</option>
                  </select>
                </label>
              </div>
              {err && <div className="text-xs text-[var(--danger)]">{err}</div>}
              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={busy}
                  className="flex-1 rounded-full bg-[var(--foreground)] py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {busy ? "Creating…" : "Create task"}
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

export function TaskRowActions({
  task,
  users,
}: {
  task: TaskRow;
  users: { id: string; name: string }[];
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function setStatus(s: "open" | "in_progress" | "waiting" | "done" | "wont_do") {
    startTransition(async () => {
      await updateTaskStatus(task.id, s);
      router.refresh();
    });
  }
  function setAssignee(userId: string | null) {
    startTransition(async () => {
      await reassignTask(task.id, userId);
      router.refresh();
    });
  }

  const dueDate = task.dueAt ? new Date(task.dueAt) : null;
  const overdue = dueDate && dueDate < new Date() && task.status !== "done" && task.status !== "wont_do";

  return (
    <li className="px-5 py-3.5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span
              className={[
                "text-[10px] font-semibold uppercase tracking-[0.14em] px-2 py-0.5 rounded-full",
                task.priority === "high"
                  ? "bg-[var(--danger)] text-white"
                  : task.priority === "low"
                    ? "bg-[var(--surface-warm)] text-[var(--muted)]"
                    : "bg-[var(--accent)] text-white",
              ].join(" ")}
            >
              {task.priority}
            </span>
            <span className="font-medium">{task.title}</span>
            {task.clientId && task.clientDisplay && (
              <Link
                href={`/practice/clients/${task.clientId}`}
                className="text-xs text-[var(--accent)] hover:underline"
              >
                {task.clientDisplay}
              </Link>
            )}
          </div>
          {task.body && (
            <div className="text-xs text-[var(--muted)] mt-1">{task.body}</div>
          )}
          <div className="text-[10px] text-[var(--muted)] mt-1 tabular">
            {dueDate && (
              <span className={overdue ? "text-[var(--danger)] font-semibold" : ""}>
                Due {dueDate.toISOString().slice(0, 16).replace("T", " ")}
                {overdue ? " (overdue)" : ""}
              </span>
            )}
            {task.assignedToName && <span> · → {task.assignedToName}</span>}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <select
            value={task.status}
            disabled={pending}
            onChange={(e) =>
              setStatus(e.currentTarget.value as "open" | "in_progress" | "waiting" | "done" | "wont_do")
            }
            data-no-lift
            className="rounded-full border border-[var(--border)] bg-white px-2.5 py-1 text-xs disabled:opacity-50"
          >
            {Object.entries(STATUS_LABEL).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
          <select
            value={task.assignedToUserId ?? ""}
            disabled={pending}
            onChange={(e) => setAssignee(e.currentTarget.value || null)}
            data-no-lift
            className="rounded-full border border-[var(--border)] bg-white px-2.5 py-1 text-xs disabled:opacity-50"
          >
            <option value="">— unassigned —</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
      </div>
    </li>
  );
}
