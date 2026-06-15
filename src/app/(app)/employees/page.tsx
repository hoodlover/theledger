import Link from "next/link";
import { db } from "@/lib/db";
import { employees, transactions, entities } from "@/lib/db/schema";
import { getActiveScope } from "@/lib/scope";
import { and, eq, gte, lte, sql, desc, asc } from "drizzle-orm";
import {
  Page,
  PageHeader,
  Card,
  StatTile,
  EmptyState,
  StatusPill,
  Money,
  Callout,
  Avatar,
} from "@/components/ui";
import {
  standardDeductionSingle,
  rothIraLimit,
  ageOn,
} from "@/lib/tax-constants";

export const dynamic = "force-dynamic";

type SP = Promise<{ year?: string }>;

function parseYear(raw: string | undefined): number {
  const cur = new Date().getFullYear();
  const n = Number(raw);
  return Number.isFinite(n) && n >= 2000 && n <= cur + 1 ? Math.floor(n) : cur;
}

export default async function EmployeesPage({
  searchParams,
}: {
  searchParams: SP;
}) {
  const sp = await searchParams;
  const year = parseYear(sp.year);
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  const stdDed = standardDeductionSingle(year);
  const rothLimit = rothIraLimit(year);
  const asOf = new Date();
  const scope = await getActiveScope();

  const where = scope.entity ? eq(employees.entityId, scope.entity.id) : undefined;

  const rows = await db
    .select({
      id: employees.id,
      legalName: employees.legalName,
      role: employees.role,
      avatarUrl: employees.avatarUrl,
      kind: employees.employeeKind,
      dob: employees.dateOfBirth,
      hireDate: employees.hireDate,
      termDate: employees.termDate,
      entityId: employees.entityId,
      entityName: entities.name,
      txnCount: sql<number>`coalesce(count(${transactions.id}), 0)::int`,
      // wages = sum of negative txn amounts (employer expense), absolute
      paidCents: sql<number>`coalesce(sum(case when ${transactions.amountCents} < 0 then -${transactions.amountCents} else 0 end), 0)::int`,
    })
    .from(employees)
    .innerJoin(entities, eq(entities.id, employees.entityId))
    .leftJoin(
      transactions,
      and(
        eq(transactions.employeeId, employees.id),
        gte(transactions.postedDate, yearStart),
        lte(transactions.postedDate, yearEnd)
      )
    )
    .where(where!)
    .groupBy(
      employees.id,
      employees.legalName,
      employees.role,
      employees.avatarUrl,
      employees.employeeKind,
      employees.dateOfBirth,
      employees.hireDate,
      employees.termDate,
      employees.entityId,
      entities.name
    )
    .orderBy(asc(employees.employeeKind), desc(sql`coalesce(sum(case when ${transactions.amountCents} < 0 then -${transactions.amountCents} else 0 end), 0)`));

  const w2 = rows.filter((r) => r.kind === "standard_w2");
  const minors = rows.filter((r) => r.kind === "minor_child");

  const w2TotalPaid = w2.reduce((s, r) => s + r.paidCents, 0);
  const minorTotalPaid = minors.reduce((s, r) => s + r.paidCents, 0);

  return (
    <Page>
      <PageHeader
        title="Employees"
        subtitle={
          scope.entity
            ? `Scoped to ${scope.entity.name} · tax year ${year}.`
            : `All entities · tax year ${year}.`
        }
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-4">
        <StatTile label="W-2 employees" value={w2.length.toLocaleString()} />
        <StatTile
          label={`W-2 wages ${year}`}
          value={<Money cents={w2TotalPaid} />}
        />
        <StatTile
          label="Minor children"
          value={minors.length.toLocaleString()}
          hint="FICA-exempt under parent sole prop"
        />
        <StatTile
          label={`Kid wages ${year}`}
          value={<Money cents={minorTotalPaid} />}
        />
      </div>

      {rows.length === 0 && (
        <EmptyState
          title="No employees yet"
          description={
            <>
              Tag a transaction to an employee on{" "}
              <Link href="/transactions" className="underline">
                /transactions
              </Link>{" "}
              — the drawer creates the employee record on first tag with a
              W-2 / Minor child kind switch.
            </>
          }
        />
      )}

      {w2.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
            W-2 employees
          </h2>
          <Card>
            <div className="overflow-x-auto">
              <table className="hidden md:table w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-left text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">
                    <th className="px-5 py-3.5">Name</th>
                    {!scope.entity && <th className="px-5 py-3.5">Entity</th>}
                    <th className="px-5 py-3.5 text-right whitespace-nowrap">Payments</th>
                    <th className="px-5 py-3.5 text-right whitespace-nowrap">YTD wages</th>
                    <th className="px-5 py-3.5 whitespace-nowrap">Hire / Term</th>
                  </tr>
                </thead>
                <tbody>
                  {w2.map((r) => (
                    <tr
                      key={r.id}
                      className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface-warm)] transition-colors"
                    >
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <Avatar src={r.avatarUrl} name={r.legalName} size={36} />
                          <div>
                            <Link
                              href={`/employees/${r.id}`}
                              className="font-medium hover:underline"
                            >
                              {r.legalName}
                            </Link>
                            {r.role && (
                              <div className="text-xs text-[var(--muted)]">
                                {r.role}
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
                      <td className="px-5 py-3.5 text-right tabular whitespace-nowrap">
                        {r.txnCount}
                      </td>
                      <td className="px-5 py-3.5 text-right whitespace-nowrap">
                        <Money cents={r.paidCents} />
                      </td>
                      <td className="px-5 py-3.5 text-xs text-[var(--muted)] whitespace-nowrap">
                        {r.hireDate ?? "—"}
                        {r.termDate ? ` → ${r.termDate}` : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Mobile: W-2 cards */}
              <ul className="md:hidden divide-y divide-[var(--border)]">
                {w2.map((r) => (
                  <li key={r.id} className="flex items-start gap-3 py-3">
                    <Avatar src={r.avatarUrl} name={r.legalName} size={36} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-3">
                        <Link
                          href={`/employees/${r.id}`}
                          className="font-medium hover:underline truncate"
                        >
                          {r.legalName}
                        </Link>
                        <span className="shrink-0 font-semibold">
                          <Money cents={r.paidCents} />
                        </span>
                      </div>
                      <div className="mt-0.5 text-xs text-[var(--muted)]">
                        {r.role ? `${r.role} · ` : ""}
                        {r.txnCount} payment{r.txnCount === 1 ? "" : "s"}
                        {!scope.entity ? ` · ${r.entityName}` : ""}
                      </div>
                      {(r.hireDate || r.termDate) && (
                        <div className="mt-0.5 text-xs text-[var(--muted)] tabular">
                          {r.hireDate ?? "—"}
                          {r.termDate ? ` → ${r.termDate}` : ""}
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </Card>
        </section>
      )}

      {minors.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
            Minor children
          </h2>
          <Callout title={`${year} sole-prop minor-child rules`} tone="info">
            A parent&rsquo;s sole prop can employ a minor without FICA
            withholding, and the child can earn up to the standard deduction
            (<Money cents={stdDed} /> for {year}) without owing federal income
            tax. Roth IRA capacity equals earned income, capped at the annual
            contribution limit (<Money cents={rothLimit} /> for {year}).
          </Callout>
          <Card className="mt-3">
            <div className="overflow-x-auto">
              <table className="hidden md:table w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-left text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">
                    <th className="px-5 py-3.5">Name</th>
                    {!scope.entity && <th className="px-5 py-3.5">Entity</th>}
                    <th className="px-5 py-3.5 whitespace-nowrap">Age</th>
                    <th className="px-5 py-3.5 text-right whitespace-nowrap">YTD wages</th>
                    <th className="px-5 py-3.5 text-right whitespace-nowrap">
                      Std-deduction left
                    </th>
                    <th className="px-5 py-3.5 text-right whitespace-nowrap">
                      Roth capacity
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {minors.map((r) => {
                    const age = ageOn(r.dob, asOf);
                    const headroom = Math.max(0, stdDed - r.paidCents);
                    const overStd = r.paidCents > stdDed;
                    const rothCap = Math.min(r.paidCents, rothLimit);
                    return (
                      <tr
                        key={r.id}
                        className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface-warm)] transition-colors"
                      >
                        <td className="px-5 py-3.5">
                          <Link
                            href={`/employees/${r.id}`}
                            className="font-medium hover:underline"
                          >
                            {r.legalName}
                          </Link>
                        </td>
                        {!scope.entity && (
                          <td className="px-5 py-3.5 text-[var(--muted)]">
                            {r.entityName}
                          </td>
                        )}
                        <td className="px-5 py-3.5 tabular whitespace-nowrap">
                          {age == null ? (
                            <StatusPill tone="warning">DOB missing</StatusPill>
                          ) : age >= 18 ? (
                            <StatusPill tone="warning">
                              {age} · no longer minor
                            </StatusPill>
                          ) : (
                            <span>{age}</span>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-right whitespace-nowrap">
                          <Money cents={r.paidCents} />
                        </td>
                        <td className="px-5 py-3.5 text-right whitespace-nowrap">
                          {overStd ? (
                            <StatusPill tone="danger">
                              Over <Money cents={stdDed} />
                            </StatusPill>
                          ) : (
                            <Money cents={headroom} />
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-right whitespace-nowrap">
                          <Money cents={rothCap} />
                          {r.paidCents > rothLimit && (
                            <div className="text-xs text-[var(--muted)]">
                              capped at limit
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Mobile: minor-child cards */}
              <ul className="md:hidden divide-y divide-[var(--border)]">
                {minors.map((r) => {
                  const age = ageOn(r.dob, asOf);
                  const headroom = Math.max(0, stdDed - r.paidCents);
                  const overStd = r.paidCents > stdDed;
                  const rothCap = Math.min(r.paidCents, rothLimit);
                  return (
                    <li key={r.id} className="py-3">
                      <div className="flex items-baseline justify-between gap-3">
                        <Link
                          href={`/employees/${r.id}`}
                          className="font-medium hover:underline truncate"
                        >
                          {r.legalName}
                        </Link>
                        <span className="shrink-0 font-semibold">
                          <Money cents={r.paidCents} />
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--muted)]">
                        <span>
                          Age:{" "}
                          {age == null
                            ? "DOB missing"
                            : age >= 18
                              ? `${age} · no longer minor`
                              : age}
                        </span>
                        <span>
                          Std-ded left:{" "}
                          {overStd ? (
                            <span className="text-[var(--danger)]">over limit</span>
                          ) : (
                            <Money cents={headroom} />
                          )}
                        </span>
                        <span>
                          Roth: <Money cents={rothCap} />
                          {r.paidCents > rothLimit ? " (capped)" : ""}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </Card>
        </section>
      )}
    </Page>
  );
}
