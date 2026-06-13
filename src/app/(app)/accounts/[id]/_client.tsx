"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  updateAccount,
  deleteAccount,
  addCardHolder,
  removeCardHolder,
} from "./_actions";

const KINDS = ["checking", "savings", "credit_card", "loc"] as const;

export function AccountEditForm({
  id,
  initial,
  txnCount,
}: {
  id: string;
  initial: {
    displayName: string;
    institution: string;
    kind: string;
    last4: string;
    routingRules: string | null;
  };
  txnCount: number;
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
          await updateAccount(id, state);
        });
      }}
      className="space-y-3"
    >
      <Field label="Display name">
        <input
          value={state.displayName}
          onChange={(e) =>
            setState({ ...state, displayName: e.currentTarget.value })
          }
          className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-sm"
        />
      </Field>
      <div className="grid grid-cols-3 gap-2">
        <Field label="Institution">
          <input
            value={state.institution}
            onChange={(e) =>
              setState({ ...state, institution: e.currentTarget.value })
            }
            className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-sm"
          />
        </Field>
        <Field label="Kind">
          <select
            value={state.kind}
            onChange={(e) =>
              setState({ ...state, kind: e.currentTarget.value })
            }
            className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-sm"
          >
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Last 4">
          <input
            value={state.last4 === "TBD" ? "" : state.last4}
            onChange={(e) =>
              setState({
                ...state,
                last4: e.currentTarget.value.replace(/\D/g, "").slice(-4) || "TBD",
              })
            }
            placeholder="0000"
            className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-sm tabular"
          />
        </Field>
      </div>
      <Field label="Notes / routing rules">
        <textarea
          value={state.routingRules ?? ""}
          onChange={(e) =>
            setState({
              ...state,
              routingRules: e.currentTarget.value || null,
            })
          }
          rows={2}
          className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-sm"
        />
      </Field>
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          disabled={deleting}
          onClick={() => {
            if (
              !confirm(
                txnCount > 0
                  ? `Delete account? This will FAIL because ${txnCount} transactions reference it. Move the txns first.`
                  : "Delete account?"
              )
            ) {
              return;
            }
            startDelete(async () => {
              try {
                await deleteAccount(id);
                router.push("/accounts");
              } catch (e) {
                alert("Delete failed — account has dependent records.");
              }
            });
          }}
          className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--muted)] hover:text-[var(--danger,oklch(0.62_0.21_22))] disabled:opacity-50"
        >
          {deleting ? "Deleting…" : "Delete account"}
        </button>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-[var(--foreground)] px-3 py-1.5 text-sm font-medium text-[var(--background)] disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}

export function CardHolderList({
  bankAccountId,
  holders,
}: {
  bankAccountId: string;
  holders: {
    id: string;
    personName: string;
    personRole: string | null;
    started: string | null;
    ended: string | null;
  }[];
}) {
  return (
    <div className="space-y-2">
      {holders.length === 0 ? (
        <div className="text-xs text-[var(--muted)]">
          No cardholders on file.
        </div>
      ) : (
        <ul className="divide-y divide-[var(--border)] rounded-md border border-[var(--border)]">
          {holders.map((h) => (
            <li
              key={h.id}
              className="flex items-baseline justify-between gap-3 px-3 py-2 text-sm"
            >
              <div>
                <span className="font-medium">{h.personName}</span>
                {h.personRole && (
                  <span className="ml-2 text-xs text-[var(--muted)]">
                    {h.personRole}
                  </span>
                )}
                <div className="text-xs text-[var(--muted)]">
                  {h.started ?? "?"}
                  {h.ended ? ` → ${h.ended}` : " · active"}
                </div>
              </div>
              <RemoveHolderBtn
                holderId={h.id}
                bankAccountId={bankAccountId}
              />
            </li>
          ))}
        </ul>
      )}
      <AddCardHolderForm bankAccountId={bankAccountId} />
    </div>
  );
}

function RemoveHolderBtn({
  holderId,
  bankAccountId,
}: {
  holderId: string;
  bankAccountId: string;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!confirm("Remove this cardholder?")) return;
        startTransition(async () => {
          await removeCardHolder(holderId, bankAccountId);
        });
      }}
      className="text-xs text-[var(--muted)] hover:text-[var(--danger,oklch(0.62_0.21_22))] disabled:opacity-50"
    >
      Remove
    </button>
  );
}

function AddCardHolderForm({ bankAccountId }: { bankAccountId: string }) {
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [started, setStarted] = useState("");
  const [pending, startTransition] = useTransition();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return;
        startTransition(async () => {
          await addCardHolder(bankAccountId, name, role, started);
          setName("");
          setRole("");
          setStarted("");
        });
      }}
      className="space-y-2"
    >
      <div className="grid grid-cols-3 gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          placeholder="Cardholder name"
          className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-sm"
        />
        <input
          value={role}
          onChange={(e) => setRole(e.currentTarget.value)}
          placeholder="Role (optional)"
          className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-sm"
        />
        <input
          type="date"
          value={started}
          onChange={(e) => setStarted(e.currentTarget.value)}
          className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-sm tabular"
        />
      </div>
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={!name.trim() || pending}
          className="rounded-md bg-[var(--foreground)] px-3 py-1 text-sm font-medium text-[var(--background)] disabled:opacity-50"
        >
          Add cardholder
        </button>
      </div>
    </form>
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
