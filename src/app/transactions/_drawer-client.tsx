"use client";

import { useRouter } from "next/navigation";
import { useTransition, useState } from "react";
import {
  tagContractor,
  untagContractor,
  tagEmployee,
  untagEmployee,
  toggleTransferFlag,
  updateNotes,
} from "./_actions";

// ───────── Close + backdrop ─────────

export function DrawerBackdrop({ returnHref }: { returnHref: string }) {
  const router = useRouter();
  return (
    <div
      className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm"
      onClick={() => router.push(returnHref)}
      aria-hidden
    />
  );
}

export function DrawerClose({ returnHref }: { returnHref: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => router.push(returnHref)}
      className="rounded-md p-1.5 text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--foreground)]"
      aria-label="Close"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 6 6 18M6 6l12 12" />
      </svg>
    </button>
  );
}

// ───────── Tagging forms ─────────

type ContractorOpt = { id: string; name: string };
type EmployeeOpt = { id: string; name: string; kind: string };

export function DrawerForms({
  transactionId,
  contractor,
  employee,
  allContractors,
  allEmployees,
  isTransfer,
  notes,
  merchant,
  untaggedContractorMatches,
  untaggedEmployeeMatches,
}: {
  transactionId: string;
  contractor: ContractorOpt | null;
  employee: EmployeeOpt | null;
  allContractors: ContractorOpt[];
  allEmployees: EmployeeOpt[];
  isTransfer: boolean;
  notes: string;
  merchant: string | null;
  untaggedContractorMatches: number;
  untaggedEmployeeMatches: number;
}) {
  return (
    <>
      <section className="space-y-2">
        <SectionLabel hint="Drives the 1099 view">Contractor (1099)</SectionLabel>
        {contractor ? (
          <TaggedRow
            label={contractor.name}
            onClear={async () => {
              await untagContractor(transactionId);
            }}
          />
        ) : (
          <ContractorForm
            transactionId={transactionId}
            options={allContractors}
            merchant={merchant}
            otherUntaggedCount={untaggedContractorMatches}
          />
        )}
      </section>

      <section className="space-y-2">
        <SectionLabel hint="Drives W-2 + minor-child views">
          Employee
        </SectionLabel>
        {employee ? (
          <TaggedRow
            label={`${employee.name}${employee.kind === "minor_child" ? " (minor)" : ""}`}
            onClear={async () => {
              await untagEmployee(transactionId);
            }}
          />
        ) : (
          <EmployeeForm
            transactionId={transactionId}
            options={allEmployees}
            merchant={merchant}
            otherUntaggedCount={untaggedEmployeeMatches}
          />
        )}
      </section>

      <section className="space-y-2">
        <SectionLabel hint="Stitched to its other side once both statements import">
          Inter-entity transfer
        </SectionLabel>
        <TransferToggle
          transactionId={transactionId}
          initial={isTransfer}
        />
      </section>

      <section className="space-y-2">
        <SectionLabel>Notes</SectionLabel>
        <NotesForm transactionId={transactionId} initial={notes} />
      </section>
    </>
  );
}

// ───── helpers ─────

function SectionLabel({
  children,
  hint,
}: {
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wide">
        {children}
      </div>
      {hint && (
        <div className="text-xs text-[var(--muted)]">{hint}</div>
      )}
    </div>
  );
}

function TaggedRow({
  label,
  onClear,
}: {
  label: string;
  onClear: () => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
      <span className="text-sm font-medium">{label}</span>
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(onClear)}
        className="text-xs text-[var(--muted)] hover:text-[var(--danger,oklch(0.62_0.21_22))] disabled:opacity-50"
      >
        Remove
      </button>
    </div>
  );
}

function ContractorForm({
  transactionId,
  options,
  merchant,
  otherUntaggedCount,
}: {
  transactionId: string;
  options: ContractorOpt[];
  merchant: string | null;
  otherUntaggedCount: number;
}) {
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState("");
  const [bulk, setBulk] = useState(false);
  const listId = `contractors-${transactionId.slice(0, 8)}`;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!value.trim()) return;
        startTransition(async () => {
          await tagContractor(transactionId, value, bulk);
          setValue("");
          setBulk(false);
        });
      }}
      className="space-y-2"
    >
      <div className="flex gap-2">
        <input
          list={listId}
          value={value}
          onChange={(e) => setValue(e.currentTarget.value)}
          placeholder="Acme Plumbing"
          className="flex-1 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-sm"
        />
        <datalist id={listId}>
          {options.map((c) => (
            <option key={c.id} value={c.name} />
          ))}
        </datalist>
        <button
          type="submit"
          disabled={pending || !value.trim()}
          className="rounded-md bg-[var(--foreground)] px-3 py-1.5 text-sm font-medium text-[var(--background)] disabled:opacity-50"
        >
          Tag
        </button>
      </div>
      {merchant && otherUntaggedCount > 0 && (
        <label className="flex items-center gap-2 text-xs text-[var(--muted)]">
          <input
            type="checkbox"
            checked={bulk}
            onChange={(e) => setBulk(e.currentTarget.checked)}
          />
          <span>
            Also tag {otherUntaggedCount.toLocaleString()} other untagged txn
            {otherUntaggedCount === 1 ? "" : "s"} with merchant &ldquo;
            {merchant}&rdquo;
          </span>
        </label>
      )}
    </form>
  );
}

function EmployeeForm({
  transactionId,
  options,
  merchant,
  otherUntaggedCount,
}: {
  transactionId: string;
  options: EmployeeOpt[];
  merchant: string | null;
  otherUntaggedCount: number;
}) {
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState("");
  const [kind, setKind] = useState<"standard_w2" | "minor_child">("standard_w2");
  const [bulk, setBulk] = useState(false);
  const listId = `employees-${transactionId.slice(0, 8)}`;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!value.trim()) return;
        startTransition(async () => {
          await tagEmployee(transactionId, value, kind, bulk);
          setValue("");
          setBulk(false);
        });
      }}
      className="space-y-2"
    >
      <div className="flex gap-2">
        <input
          list={listId}
          value={value}
          onChange={(e) => {
            const v = e.currentTarget.value;
            setValue(v);
            const match = options.find((o) => o.name === v);
            if (match) setKind(match.kind as "standard_w2" | "minor_child");
          }}
          placeholder="Jane Smith"
          className="flex-1 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-sm"
        />
        <datalist id={listId}>
          {options.map((e) => (
            <option key={e.id} value={e.name} />
          ))}
        </datalist>
      </div>
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-3 text-xs">
          <label className="flex items-center gap-1">
            <input
              type="radio"
              name="kind"
              checked={kind === "standard_w2"}
              onChange={() => setKind("standard_w2")}
            />
            W-2
          </label>
          <label className="flex items-center gap-1">
            <input
              type="radio"
              name="kind"
              checked={kind === "minor_child"}
              onChange={() => setKind("minor_child")}
            />
            Minor child (FICA-exempt)
          </label>
        </div>
        <button
          type="submit"
          disabled={pending || !value.trim()}
          className="rounded-md bg-[var(--foreground)] px-3 py-1.5 text-sm font-medium text-[var(--background)] disabled:opacity-50"
        >
          Tag
        </button>
      </div>
      {merchant && otherUntaggedCount > 0 && (
        <label className="flex items-center gap-2 text-xs text-[var(--muted)]">
          <input
            type="checkbox"
            checked={bulk}
            onChange={(e) => setBulk(e.currentTarget.checked)}
          />
          <span>
            Also tag {otherUntaggedCount.toLocaleString()} other untagged txn
            {otherUntaggedCount === 1 ? "" : "s"} with merchant &ldquo;
            {merchant}&rdquo;
          </span>
        </label>
      )}
    </form>
  );
}

function TransferToggle({
  transactionId,
  initial,
}: {
  transactionId: string;
  initial: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState(initial);
  return (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={value}
        disabled={pending}
        onChange={(e) => {
          const next = e.currentTarget.checked;
          setValue(next);
          startTransition(async () => {
            await toggleTransferFlag(transactionId, next);
          });
        }}
      />
      <span>This is a transfer between entities</span>
    </label>
  );
}

function NotesForm({
  transactionId,
  initial,
}: {
  transactionId: string;
  initial: string;
}) {
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState(initial);
  const dirty = value !== initial;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          await updateNotes(transactionId, value);
        });
      }}
      className="space-y-2"
    >
      <textarea
        value={value}
        onChange={(e) => setValue(e.currentTarget.value)}
        rows={3}
        placeholder="Add a note for the CPA…"
        className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-sm"
      />
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={pending || !dirty}
          className="rounded-md bg-[var(--foreground)] px-3 py-1.5 text-sm font-medium text-[var(--background)] disabled:opacity-50"
        >
          Save
        </button>
      </div>
    </form>
  );
}
