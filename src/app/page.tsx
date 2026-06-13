import Link from "next/link";

const V0_FEATURES = [
  { slug: "entities", title: "Entities", desc: "Six LLCs / sole prop / individual." },
  { slug: "accounts", title: "Bank & cards", desc: "Bluevine sub-accounts, BofA, card holders." },
  { slug: "transactions", title: "Transactions", desc: "Filter by entity, account, date, contractor, employee." },
  { slug: "contractors", title: "1099 contractors", desc: "YTD totals, W-9 status, missing-W9 warnings." },
  { slug: "employees", title: "Employees", desc: "W-2s + minor kids with FICA-exempt headroom." },
  { slug: "transfers", title: "Inter-entity transfers", desc: "Rent, cleaning, kid wages — standing rules + matches." },
  { slug: "receipts", title: "Receipts", desc: "Drop-folder + phone upload, auto-match to txns." },
  { slug: "imports", title: "Statement imports", desc: "Drop a PDF → 30 txns appear under the right entity." },
];

export default function Home() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-12 font-sans">
      <header className="mb-10">
        <h1 className="text-3xl font-semibold tracking-tight">Tax Ledger</h1>
        <p className="mt-2 text-zinc-600">
          Slim multi-entity tax dashboard. v0 placeholders below — see{" "}
          <code className="rounded bg-zinc-100 px-1 py-0.5 text-sm">BRIEF.md</code>{" "}
          for full scope.
        </p>
      </header>
      <ul className="grid gap-3 sm:grid-cols-2">
        {V0_FEATURES.map((f) => (
          <li key={f.slug}>
            <Link
              href={`/${f.slug}`}
              className="block rounded-lg border border-zinc-200 p-4 transition hover:border-zinc-400 hover:bg-zinc-50"
            >
              <div className="font-medium">{f.title}</div>
              <div className="mt-1 text-sm text-zinc-600">{f.desc}</div>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
