import Link from "next/link";
import { db } from "@/lib/db";
import { entities, transactions } from "@/lib/db/schema";
import { eq, sql, asc } from "drizzle-orm";
import {
  Page,
  PageHeader,
  Card,
  Callout,
} from "@/components/ui";

export const dynamic = "force-dynamic";

type SP = Promise<{ year?: string }>;

function yearOptions(): number[] {
  const cur = new Date().getFullYear();
  return [cur, cur - 1, cur - 2];
}

export default async function ExportPage({
  searchParams,
}: {
  searchParams: SP;
}) {
  const sp = await searchParams;
  const cur = new Date().getFullYear();
  const yearParam = Number(sp.year);
  const year =
    Number.isFinite(yearParam) && yearParam >= 2000 && yearParam <= cur + 1
      ? Math.floor(yearParam)
      : cur;
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;

  const rows = await db
    .select({
      id: entities.id,
      slug: entities.slug,
      name: entities.name,
      kind: entities.kind,
      txnCount: sql<number>`(
        SELECT count(*)::int FROM ${transactions}
         WHERE ${transactions.entityId} = ${entities.id}
           AND ${transactions.postedDate} >= ${yearStart}
           AND ${transactions.postedDate} <= ${yearEnd}
      )`,
    })
    .from(entities)
    .orderBy(asc(entities.name));

  return (
    <Page>
      <PageHeader
        title={`CPA export — ${year}`}
        subtitle="Per-entity CSV bundles for the CPA hand-off. One transaction CSV, one 1099-NEC CSV, one employee summary CSV per entity."
        actions={
          <div className="flex gap-1">
            {yearOptions().map((y) => (
              <Link
                key={y}
                href={`/export?year=${y}`}
                className={`rounded-full border border-[var(--border)] px-4 py-1.5 text-sm font-semibold ${
                  y === year
                    ? "bg-[var(--foreground)] text-white"
                    : "hover:bg-[var(--surface-warm)] transition-colors"
                }`}
              >
                {y}
              </Link>
            ))}
          </div>
        }
      />

      <Callout title="What the CPA gets" tone="info">
        Hit any of the buttons below to download a CSV. Each CSV is
        deterministic per URL, so you can re-pull at any time before filing.
        Transaction CSVs include contractor / employee / transfer tags so
        category mapping happens upstream of the CPA.
      </Callout>

      <div className="mt-6">
        <h2 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
          All entities ({year})
        </h2>
        <Card className="flex flex-wrap gap-2 p-4">
          <Btn href={`/export/transactions?year=${year}`}>
            Transactions ({year})
          </Btn>
          <Btn href={`/contractors/export?year=${year}`}>
            1099-NEC ({year})
          </Btn>
          <Btn href={`/export/employees?year=${year}`}>
            Employee summary ({year})
          </Btn>
        </Card>
      </div>

      <div className="mt-6">
        <h2 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
          Per entity
        </h2>
        <Card>
          <ul className="divide-y divide-[var(--border)]">
            {rows.map((e) => (
              <li key={e.id} className="px-4 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <div>
                    <div className="font-medium">{e.name}</div>
                    <div className="text-xs text-[var(--muted)]">
                      {e.kind} · {e.txnCount.toLocaleString()} txn
                      {e.txnCount === 1 ? "" : "s"} in {year}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Btn
                      href={`/export/transactions?entity=${e.slug}&year=${year}`}
                    >
                      Transactions
                    </Btn>
                    <Btn
                      href={`/contractors/export?entity=${e.slug}&year=${year}`}
                    >
                      1099-NEC
                    </Btn>
                    <Btn
                      href={`/export/employees?entity=${e.slug}&year=${year}`}
                    >
                      Employees
                    </Btn>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </Page>
  );
}

function Btn({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="rounded-full border border-[var(--border)] bg-white px-4 py-2 text-sm font-semibold transition-all duration-200 hover:-translate-y-0.5 hover:bg-[var(--foreground)] hover:text-white hover:shadow-[0_8px_24px_rgba(15,23,42,0.20)]"
    >
      {children}
    </Link>
  );
}
