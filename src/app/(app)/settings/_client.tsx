"use client";

import { useState, useTransition } from "react";
import { changePassword, signOutEverywhere } from "./_actions";

const input =
  "w-full rounded-lg border border-[var(--border)] bg-[var(--surface-warm)] px-3 py-2 text-sm focus:bg-white focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20 transition-colors";

export function ChangePasswordForm() {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<
    null | { ok: true } | { ok: false; error: string }
  >(null);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const form = e.currentTarget;
        startTransition(async () => {
          const res = await changePassword(fd);
          setResult(res);
          if (res.ok) {
            form.reset();
          }
        });
      }}
      className="space-y-3"
    >
      {result?.ok === true && (
        <div className="rounded-md border border-[#cfe0d2] bg-[#eff5f0] px-3 py-2 text-sm text-[#3a5a40]">
          Password updated.
        </div>
      )}
      {result?.ok === false && (
        <div className="rounded-md border border-[#ebcacb] bg-[#f5e8e9] px-3 py-2 text-sm text-[var(--danger)]">
          {result.error}
        </div>
      )}
      <Field label="Current password">
        <input
          type="password"
          name="currentPassword"
          autoComplete="current-password"
          required
          className={input}
        />
      </Field>
      <Field label="New password (min 8)">
        <input
          type="password"
          name="newPassword"
          autoComplete="new-password"
          required
          minLength={8}
          className={input}
        />
      </Field>
      <Field label="Confirm new password">
        <input
          type="password"
          name="confirmPassword"
          autoComplete="new-password"
          required
          minLength={8}
          className={input}
        />
      </Field>
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-full bg-[var(--foreground)] py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {pending ? "Updating…" : "Change password"}
      </button>
    </form>
  );
}

export function SignOutEverywhereForm() {
  return (
    <form action={signOutEverywhere}>
      <button
        type="submit"
        className="rounded-full border border-[var(--border)] px-4 py-1.5 text-sm font-semibold text-[var(--danger)] hover:bg-[var(--surface-warm)]"
      >
        Sign me out on this device
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
