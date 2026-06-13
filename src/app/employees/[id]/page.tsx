import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { employees, transactions, entities, bankAccounts } from "@/lib/db/schema";
import { eq, sql, desc, and, gte, lte } from "drizzle-orm";
import { Page, PageHeader, Card, StatTile, Money, StatusPill, EmptyState } from "@/components/ui";
import { EmployeeEditForm } from "./_edit-form";
import {
  standardDeductionSingle,
  rothIraLimit,
  ageOn,
} from "@/lib/tax-constants";

export const dynamic = "force-dynamic";

export default async function EmployeeDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const year = new Date().getFullYear();
  const stdDed = standardDeductionSingle(year);
  const rothLimit = rothIraLimit(year);

  const row = (
    await db
      .select({
        emp: employees,
        entityName: entities.name,
        entitySlug: entities.slug,
      })
      .from(employees)
      .innerJoin(entities, eq(entities.id, employees.entityId))
      .where(eq(employees.id, id))
  )[0];

  if (!row) notFound();
  const { emp, entityName, entitySlug } = row;

  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;

  const [stats] = await db
    .select({
      count: sql<number>`coalesce(count(*), 0)::int`,
      paidCents: sql<number>`coalesce(sum(case when ${transactions.amountCents} < 0 then -${transactions.amountCents} else 0 end), 0)::int`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.employeeId, id),
        gte(transactions.postedDate, yearStart),
        lte(transactions.postedDate, yearEnd)
      )
    );

  const recent = await db
    .select({
      id: transactions.id,
      postedDate: transactions.postedDate,
      amountCents: transactions.amountCents,
      normalizedMerchant: transactions.normalizedMerchant,
      rawDescription: transactions.rawDescription,
      accountName: bankAccounts.displayName,
    })
    .from(transactions)
    .innerJoin(bankAccounts, eq(bankAccounts.id, transactions.bankAccountId))
    .where(eq(transactions.employeeId, id))
    .orderBy(desc(transactions.postedDate))
    .limit(20);

  const age = ageOn(emp.dateOfBirth, new Date());
  const isMinor = emp.employeeKind === "minor_child";
  const headroom = Math.max(0, stdDed - stats.paidCents);
  const overStd = stats.paidCents > stdDed;
  const rothCap = Math.min(stats.paidCents, rothLimit);

  return (
    <Page>
      <PageHeader
        title={emp.legalName}
        subtitle={
          <>
            {isMinor ? "Minor child" : "W-2 employee"} at{" "}
            <Link href={`/transactions?account=&q=${encodeURIComponent(emp.legalName)}`} className="hover:underline">
              {entityName}
            </Link>
            {age != null ? ` · age ${age}` : ""}
          </>
        }
        actions={
          <Link
            href="/employees"
            className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--muted)] hover:text-[var(--foreground)]"
          >
            &larr; Employees
          </Link>
        }
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-4">
        <StatTile label="Payments" value={stats.count.toLocaleString()} />
        <StatTile label={`YTD ${year}`} value={<Money cents={stats.paidCents} />} />
        {isMinor ? (
          <>
            <StatTile
              label="Std-deduction left"
              value={overStd ? "Over" : <Money cents={headroom} />}
              tone={overStd ? "danger" : "neutral"}
              hint={overStd ? `${year} cap: ${(stdDed / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })}` : undefined}
            />
            <StatTile
              label="Roth IRA capacity"
              value={<Money cents={rothCap} />}
              hint={stats.paidCents > rothLimit ? "capped at annual limit" : undefined}
            />
          </>
        ) : (
          <>
            <StatTile label="Hire date" value={emp.hireDate ?? "—"} />
            <StatTile
              label="Status"
              value={emp.termDate ? "Terminated" : "Active"}
              tone={emp.termDate ? "warning" : "success"}
            />
          </>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
            Edit
          </h2>
          <Card className="p-4">
            <EmployeeEditForm
              id={emp.id}
              initial={{
                legalName: emp.legalName,
                employeeKind: emp.employeeKind as "standard_w2" | "minor_child",
                dateOfBirth: emp.dateOfBirth,
                hireDate: emp.hireDate,
                termDate: emp.termDate,
                address: emp.address,
                defaultPropertyTag: emp.defaultPropertyTag,
              }}
            />
          </Card>
        </div>

        <div className="lg:col-span-2">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
            Recent payments
          </h2>
          {recent.length === 0 ? (
            <EmptyState
              title="No payments tagged yet"
              description="Tag transactions to this employee from the /transactions drawer."
            />
          ) : (
            <Card>
              <ul className="divide-y divide-[var(--border)] text-sm">
                {recent.map((t) => (
                  <li key={t.id} className="px-4 py-3">
                    <Link
                      href={`/transactions?txn=${t.id}`}
                      className="flex items-baseline justify-between gap-3 hover:underline"
                    >
                      <span className="tabular text-[var(--muted)]">
                        {t.postedDate}
                      </span>
                      <span className="font-medium">
                        {t.normalizedMerchant ?? "—"}
                      </span>
                      <span className="tabular">
                        <Money cents={t.amountCents} signed />
                      </span>
                    </Link>
                    <div className="mt-1 text-xs text-[var(--muted)]">
                      {t.accountName}
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </Page>
  );
}
