"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateEmployee, deleteEmployee } from "./_actions";

export function EmployeeEditForm({
  id,
  initial,
}: {
  id: string;
  initial: {
    legalName: string;
    employeeKind: "standard_w2" | "minor_child";
    dateOfBirth: string | null;
    hireDate: string | null;
    termDate: string | null;
    address: string | null;
    defaultPropertyTag: string | null;
  };
}) {
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState(initial);
  const [deleting, startDelete] = useTransition();
  const router = useRouter();

  function set<K extends keyof typeof state>(
    k: K,
    v: (typeof state)[K]
  ): void {
    setState((s) => ({ ...s, [k]: v }));
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          await updateEmployee(id, {
            legalName: state.legalName,
            employeeKind: state.employeeKind,
            dateOfBirth: state.dateOfBirth ?? "",
            hireDate: state.hireDate ?? "",
            termDate: state.termDate ?? "",
            address: state.address ?? "",
            defaultPropertyTag: state.defaultPropertyTag ?? "",
          });
        });
      }}
      className="space-y-4"
    >
      <Field label="Legal name">
        <input
          value={state.legalName}
          onChange={(e) => set("legalName", e.currentTarget.value)}
          className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-sm"
        />
      </Field>

      <Field label="Kind">
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-1">
            <input
              type="radio"
              checked={state.employeeKind === "standard_w2"}
              onChange={() => set("employeeKind", "standard_w2")}
            />
            W-2
          </label>
          <label className="flex items-center gap-1">
            <input
              type="radio"
              checked={state.employeeKind === "minor_child"}
              onChange={() => set("employeeKind", "minor_child")}
            />
            Minor child (FICA-exempt)
          </label>
        </div>
      </Field>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Date of birth">
          <input
            type="date"
            value={state.dateOfBirth ?? ""}
            onChange={(e) => set("dateOfBirth", e.currentTarget.value || null)}
            className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-sm tabular"
          />
        </Field>
        <Field label="Hire date">
          <input
            type="date"
            value={state.hireDate ?? ""}
            onChange={(e) => set("hireDate", e.currentTarget.value || null)}
            className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-sm tabular"
          />
        </Field>
        <Field label="Term date">
          <input
            type="date"
            value={state.termDate ?? ""}
            onChange={(e) => set("termDate", e.currentTarget.value || null)}
            className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-sm tabular"
          />
        </Field>
      </div>

      <Field label="Address (for W-2)">
        <textarea
          value={state.address ?? ""}
          onChange={(e) => set("address", e.currentTarget.value || null)}
          rows={2}
          className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-sm"
        />
      </Field>

      <Field label="Default property tag (optional)">
        <input
          value={state.defaultPropertyTag ?? ""}
          onChange={(e) => set("defaultPropertyTag", e.currentTarget.value || null)}
          placeholder="e.g. ptc-havens"
          className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-sm"
        />
      </Field>

      <div className="flex justify-between gap-2">
        <button
          type="button"
          disabled={deleting}
          onClick={() => {
            if (!confirm("Delete employee? This unlinks their tagged transactions.")) return;
            startDelete(async () => {
              await deleteEmployee(id);
              router.push("/employees");
            });
          }}
          className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--muted)] hover:text-[var(--danger,oklch(0.62_0.21_22))] disabled:opacity-50"
        >
          {deleting ? "Deleting…" : "Delete"}
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
