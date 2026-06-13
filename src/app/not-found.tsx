import Image from "next/image";
import Link from "next/link";

export default function NotFound() {
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
        <div className="mt-6 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">
          Cobb Family Legacy
        </div>
        <h1 className="mt-3 font-display text-4xl tracking-tight">
          404 · Not found
        </h1>
        <p className="mt-3 text-sm text-[var(--muted)]">
          The page you were looking for isn&apos;t here. Maybe a stale link,
          a typo, or a page that&apos;s been moved.
        </p>
        <div className="mt-7 flex flex-wrap items-center justify-center gap-2">
          <Link
            href="/"
            className="rounded-full bg-[var(--foreground)] px-5 py-2.5 text-sm font-semibold text-white hover:-translate-y-0.5 transition-all duration-200 hover:shadow-[0_8px_24px_rgba(15,23,42,0.20)]"
          >
            Dashboard
          </Link>
          <Link
            href="/transactions"
            className="rounded-full border border-[var(--border)] px-5 py-2.5 text-sm font-semibold hover:bg-[var(--surface-warm)] transition-colors"
          >
            Transactions
          </Link>
        </div>
      </div>
    </div>
  );
}
