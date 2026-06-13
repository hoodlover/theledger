import Link from "next/link";
import { db } from "@/lib/db";
import { contractors, transactions, entities } from "@/lib/db/schema";
import { getActiveScope } from "@/lib/scope";
import { eq, sql, and, gte, lte, desc, asc, isNotNull } from "drizzle-orm";
import {
  Page,
  PageHeader,
  Card,
  StatTile,
  EmptyState,
  StatusPill,
  Money,
  Callout,
  ButtonLink,
  Avatar,
} from "@/components/ui";

export const dynamic = "force-dynamic";

const THRESHOLD_CENTS = 60_000; // $600

type SP = Promise<{ year?: string }>;

function parseYear(raw: string | undefined): number {
  const now = new Date();
  const cur = now.getFullYear();
  const n = Number(raw);
  return Number.isFinite(n) && n >= 2000 && n <= cur + 1 ? Math.floor(n) : cur;
}

export default async function ContractorsPage({
  searchParams,
}: {
  searchParams: SP;
}) {
  const sp = await searchParams;
  const year = parseYear(sp.year);
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  const scope = await getActiveScope();

  // Year-bounded aggregate of payments per contractor.
  // Payments are NEGATIVE (debits) on the transaction row; we report the
  // absolute value for human display.
  const where = scope.entity
    ? eq(contractors.entityId, scope.entity.id)
    : undefined;

  const rows = await db
    .select({
      id: contractors.id,
      legalName: contractors.legalName,
      dba: contractors.dba,
      role: contractors.role,
      avatarUrl: contractors.avatarUrl,
      entityId: contractors.entityId,
      entityName: entities.name,
      w9DocUrl: contractors.w9DocUrl,
      txnCount: sql<number>`coalesce(count(${transactions.id}), 0)::int`,
      // SUM of NEGATIVE amounts → multiply by -1 for display as "paid".
      paidCents: sql<number>`coalesce(sum(case when ${transactions.amountCents} < 0 then -${transactions.amountCents} else 0 end), 0)::int`,
    })
    .from(contractors)
    .innerJoin(entities, eq(entities.id, contractors.entityId))
    .leftJoin(
      transactions,
      and(
        eq(transactions.contractorId, contractors.id),
        gte(transactions.postedDate, yearStart),
        lte(transactions.postedDate, yearEnd)
      )
    )
    .where(where!)
    .groupBy(contractors.id, contractors.legalName, contractors.dba, contractors.role, contractors.avatarUrl, contractors.entityId, contractors.w9DocUrl, entities.name)
    .orderBy(desc(sql`coalesce(sum(case when ${transactions.amountCents} < 0 then -${transactions.amountCents} else 0 end), 0)`), asc(contractors.legalName));

  const totalPaid = rows.reduce((s, r) => s + r.paidCents, 0);
  const overThreshold = rows.filter((r) => r.paidCents >= THRESHOLD_CENTS);
  const missingW9 = rows.filter((r) => !r.w9DocUrl);
  const overWithoutW9 = overThreshold.filter((r) => !r.w9DocUrl);

  const exportHref = scope.entity
    ? `/contractors/export?entity=${scope.entity.slug}&year=${year}`
    : `/contractors/export?year=${year}`;

  return (
    <Page>
      <PageHeader
        title="1099 contractors"
        subtitle={
          scope.entity
            ? `Scoped to ${scope.entity.name} · tax year ${year}.`
            : `All entities · tax year ${year}.`
        }
        actions={
          rows.length > 0 ? (
            <ButtonLink href={exportHref}>Export 1099 CSV</ButtonLink>
          ) : undefined
        }
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-4">
        <StatTile
          label="Contractors"
          value={rows.length.toLocaleString()}
        />
        <StatTile
          label={`Paid ${year}`}
          value={<Money cents={totalPaid} />}
        />
        <StatTile
          label={`Over $600`}
          value={overThreshold.length.toLocaleString()}
          tone={overWithoutW9.length > 0 ? "warning" : "neutral"}
          hint={
            overWithoutW9.length > 0
              ? `${overWithoutW9.length} missing W-9`
              : undefined
          }
        />
        <StatTile
          label="Missing W-9"
          value={missingW9.length.toLocaleString()}
          tone={missingW9.length > 0 ? "warning" : "neutral"}
        />
      </div>

      {overWithoutW9.length > 0 && (
        <div className="mb-6">
          <Callout title={`${overWithoutW9.length} contractor${overWithoutW9.length === 1 ? "" : "s"} require a 1099 but have no W-9 on file`} tone="warning">
            IRS triggers a 1099-NEC at $600/yr per contractor. Get a W-9 before Jan 31{" "}
            {year + 1}.
            <ul className="mt-2 list-disc pl-5">
              {overWithoutW9.slice(0, 5).map((r) => (
                <li key={r.id}>
                  {r.legalName} — <Money cents={r.paidCents} /> at{" "}
                  {r.entityName}
                </li>
              ))}
              {overWithoutW9.length > 5 && (
                <li className="text-[var(--muted)]">
                  + {overWithoutW9.length - 5} more
                </li>
              )}
            </ul>
          </Callout>
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState
          title="No contractors yet"
          description={
            <>
              Tag a transaction to a contractor on{" "}
              <Link href="/transactions" className="underline">
                /transactions
              </Link>
              . The first tag creates the contractor; subsequent ones add to
              their YTD total here.
            </>
          }
        />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">
                  <th className="px-5 py-3 font-semibold">Contractor</th>
                  {!scope.entity && <th className="px-5 py-3 font-semibold">Entity</th>}
                  <th className="px-5 py-3 font-semibold text-right whitespace-nowrap">
                    Payments
                  </th>
                  <th className="px-5 py-3 font-semibold text-right whitespace-nowrap">
                    YTD {year}
                  </th>
                  <th className="px-5 py-3 font-semibold whitespace-nowrap">W-9</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const over = r.paidCents >= THRESHOLD_CENTS;
                  const filterHref = `/transactions?q=${encodeURIComponent(r.legalName)}`;
                  return (
                    <tr
                      key={r.id}
                      className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface-warm)] transition-colors"
                    >
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <Avatar src={r.avatarUrl} name={r.dba ?? r.legalName} size={40} />
                          <div>
                            <Link
                              href={`/contractors/${r.id}`}
                              className="font-medium hover:underline text-[var(--foreground)]"
                            >
                              {r.dba ?? r.legalName}
                            </Link>
                            {r.role && (
                              <div className="text-xs text-[var(--muted)]">
                                {r.role}
                              </div>
                            )}
                            {r.dba && (
                              <div className="text-xs text-[var(--muted)]">
                                1099: {r.legalName}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      {!scope.entity && (
                        <td className="px-5 py-3.5 text-[var(--muted)]">
                          {r.entityName}
                        </td>
                      )}
                      <td className="px-5 py-3.5 text-right tabular whitespace-nowrap text-[var(--body)]">
                        {r.txnCount}
                      </td>
                      <td className="px-5 py-3.5 text-right whitespace-nowrap font-semibold">
                        <Money cents={r.paidCents} />
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        {r.w9DocUrl ? (
                          <StatusPill tone="success">On file</StatusPill>
                        ) : over ? (
                          <StatusPill tone="warning">Missing — needed</StatusPill>
                        ) : (
                          <StatusPill tone="neutral">Missing</StatusPill>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </Page>
  );
}
