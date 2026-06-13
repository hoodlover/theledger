"use client";

import { useRef, useState, useTransition } from "react";
import { addMileage, deleteMileage } from "./_actions";

const input =
  "w-full rounded-lg border border-[var(--border)] bg-[var(--surface-warm)] px-3 py-2 text-sm focus:bg-white focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20 transition-colors";

export type EntityOpt = { id: string; name: string };

export function MileageForm({
  entities,
  defaultEntityId,
  todayISO,
}: {
  entities: EntityOpt[];
  defaultEntityId: string;
  todayISO: string;
}) {
  const [pending, startTransition] = useTransition();
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [entityId, setEntityId] = useState(defaultEntityId);

  return (
    <form
      ref={formRef}
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const miles = Number(fd.get("miles"));
        if (!Number.isFinite(miles) || miles <= 0) return;
        startTransition(async () => {
          await addMileage({
            entityId,
            tripDate: String(fd.get("tripDate")),
            miles,
            vehicleLabel: String(fd.get("vehicleLabel") ?? ""),
            startLocation: String(fd.get("startLocation") ?? ""),
            endLocation: String(fd.get("endLocation") ?? ""),
            businessPurpose: String(fd.get("businessPurpose") ?? ""),
            notes: String(fd.get("notes") ?? ""),
          });
          formRef.current?.reset();
          setSavedAt(new Date().toLocaleTimeString());
        });
      }}
      className="space-y-3"
    >
      {savedAt && (
        <div className="rounded-md border border-[#cfe0d2] bg-[#eff5f0] px-3 py-2 text-sm text-[#3a5a40]">
          Saved at {savedAt}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Entity">
          <select
            value={entityId}
            onChange={(e) => setEntityId(e.currentTarget.value)}
            className={input}
          >
            {entities.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Date">
          <input
            type="date"
            name="tripDate"
            defaultValue={todayISO}
            required
            className={input + " tabular"}
          />
        </Field>
      </div>
      <Field label="Miles">
        <input
          type="number"
          name="miles"
          step="0.1"
          min="0.1"
          required
          inputMode="decimal"
          placeholder="32.5"
          className={input + " tabular text-lg font-medium"}
        />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="From (optional)">
          <input name="startLocation" className={input} placeholder="Office" />
        </Field>
        <Field label="To (optional)">
          <input name="endLocation" className={input} placeholder="Client site" />
        </Field>
      </div>
      <Field label="Business purpose">
        <input
          name="businessPurpose"
          className={input}
          placeholder="Client visit / supply run / bank drop"
        />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Vehicle (optional)">
          <input
            name="vehicleLabel"
            className={input}
            placeholder="Lance Tesla / Heather Sierra"
          />
        </Field>
        <Field label="Notes (optional)">
          <input name="notes" className={input} />
        </Field>
      </div>
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-full bg-[var(--foreground)] py-2.5 text-sm font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(15,23,42,0.20)] disabled:opacity-50 disabled:hover:translate-y-0"
      >
        {pending ? "Saving…" : "Log trip"}
      </button>
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
    <label className="block space-y-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
        {label}
      </span>
      {children}
    </label>
  );
}

export function DeleteMileageBtn({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!confirm("Delete this trip?")) return;
        startTransition(async () => {
          await deleteMileage(id);
        });
      }}
      className="text-xs text-[var(--muted)] hover:text-[var(--danger)] disabled:opacity-50"
    >
      ×
    </button>
  );
}
