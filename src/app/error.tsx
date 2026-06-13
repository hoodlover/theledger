"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface in server logs / Vercel dashboard
    console.error("App-level error caught:", error);
  }, [error]);

  return (
    <div className="min-h-screen grid place-items-center bg-[var(--background)] px-6">
      <div className="text-center max-w-md">
        <Image
          src="/theledger-assets/logo.png"
          alt="The Ledger"
          width={64}
          height={64}
          priority
          className="mx-auto rounded-xl"
        />
        <div className="mt-6 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--danger)]">
          Something went wrong
        </div>
        <h1 className="mt-3 font-display text-3xl tracking-tight">
          Unexpected error
        </h1>
        <p className="mt-3 text-sm text-[var(--muted)]">
          We logged this — try the page again, or head back to the dashboard.
        </p>
        {error.digest && (
          <p className="mt-2 text-[10px] font-mono text-[var(--muted)]">
            digest: {error.digest}
          </p>
        )}
        <div className="mt-7 flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => reset()}
            className="rounded-full bg-[var(--foreground)] px-5 py-2.5 text-sm font-semibold text-white hover:-translate-y-0.5 transition-all duration-200 hover:shadow-[0_8px_24px_rgba(15,23,42,0.20)]"
          >
            Try again
          </button>
          <Link
            href="/"
            className="rounded-full border border-[var(--border)] px-5 py-2.5 text-sm font-semibold hover:bg-[var(--surface-warm)] transition-colors"
          >
            Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
