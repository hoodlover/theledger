import Link from "next/link";
import {
  Page,
  PageHeader,
  StatTile,
  Card,
  SectionHeader,
  Money,
  StatusPill,
  EmptyState,
  formatMoney,
} from "@/components/ui";
import { db } from "@/lib/db";
import {
  entities,
  transactions,
  contractors,
  employees,
} from "@/lib/db/schema";
import { getActiveScope } from "@/lib/scope";
import {
  and,
  eq,
  sql,
  gte,
  lte,
  asc,
  desc,
} from "drizzle-orm";

export const dynamic = "force-dynamic";

type SP = Promise<{ year?: string }>;

function parseYear(raw: string | undefined): number {
  const cur = new Date().getFullYear();
  const n = Number(raw);
  return Number.isFinite(n) && n >= 2000 && n <= cur + 1 ? Math.floor(n) : cur;
}

const ENTITY_PHOTO: Record<string, string> = {
  "path-to-change": "/theledger-assets/entity-path-to-change.png",
  "ptc-havens": "/theledger-assets/entity-ptc-havens.png",
  "hl-place-of-grace": "/theledger-assets/entity-hl-place-of-grace.png",
  "hl-havens": "/theledger-assets/entity-hl-havens.png",
  cfs: "/theledger-assets/entity-cfs.png",
  "personal-joint": "/theledger-assets/emblem-wider.webp",
};

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: SP;
}) {
  const sp = await searchParams;
  const year = parseYear(sp.year);
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  const scope = await getActiveScope();
  const cur = new Date().getFullYear();

  const entityFilter = scope.entity ? eq(transactions.entityId, scope.entity.id) : undefined;
  const dateFilter = and(
    gte(transactions.postedDate, yearStart),
    lte(transactions.postedDate, yearEnd)
  );
  const where = entityFilter ? and(entityFilter, dateFilter) : dateFilter;

  const [
    [totals],
    perEntity,
    perMonth,
    topContractors,
    topEmployees,
    [classification],
  ] = await Promise.all([
    db
      .select({
        inflow: sql<number>`coalesce(sum(case when ${transactions.amountCents} > 0 then ${transactions.amountCents} else 0 end), 0)::int`,
        outflow: sql<number>`coalesce(sum(case when ${transactions.amountCents} < 0 then -${transactions.amountCents} else 0 end), 0)::int`,
        net: sql<number>`coalesce(sum(${transactions.amountCents}), 0)::int`,
        count: sql<number>`coalesce(count(*), 0)::int`,
      })
      .from(transactions)
      .where(where),
    db
      .select({
        entityId: entities.id,
        slug: entities.slug,
        name: entities.name,
        inflow: sql<number>`coalesce(sum(case when ${transactions.amountCents} > 0 then ${transactions.amountCents} else 0 end), 0)::int`,
        outflow: sql<number>`coalesce(sum(case when ${transactions.amountCents} < 0 then -${transactions.amountCents} else 0 end), 0)::int`,
        net: sql<number>`coalesce(sum(${transactions.amountCents}), 0)::int`,
        count: sql<number>`coalesce(count(${transactions.id}), 0)::int`,
      })
      .from(entities)
      .leftJoin(
        transactions,
        and(
          eq(transactions.entityId, entities.id),
          gte(transactions.postedDate, yearStart),
          lte(transactions.postedDate, yearEnd)
        )
      )
      .groupBy(entities.id, entities.slug, entities.name)
      .orderBy(desc(sql`coalesce(sum(${transactions.amountCents}), 0)`)),
    db
      .select({
        month: sql<string>`to_char(${transactions.postedDate}, 'YYYY-MM')`,
        inflow: sql<number>`coalesce(sum(case when ${transactions.amountCents} > 0 then ${transactions.amountCents} else 0 end), 0)::int`,
        outflow: sql<number>`coalesce(sum(case when ${transactions.amountCents} < 0 then -${transactions.amountCents} else 0 end), 0)::int`,
      })
      .from(transactions)
      .where(where)
      .groupBy(sql`to_char(${transactions.postedDate}, 'YYYY-MM')`)
      .orderBy(asc(sql`to_char(${transactions.postedDate}, 'YYYY-MM')`)),
    db
      .select({
        id: contractors.id,
        legalName: contractors.legalName,
        dba: contractors.dba,
        role: contractors.role,
        avatarUrl: contractors.avatarUrl,
        paidCents: sql<number>`coalesce(sum(case when ${transactions.amountCents} < 0 then -${transactions.amountCents} else 0 end), 0)::int`,
        txnCount: sql<number>`coalesce(count(${transactions.id}), 0)::int`,
      })
      .from(contractors)
      .leftJoin(
        transactions,
        and(
          eq(transactions.contractorId, contractors.id),
          gte(transactions.postedDate, yearStart),
          lte(transactions.postedDate, yearEnd)
        )
      )
      .where(
        scope.entity ? eq(contractors.entityId, scope.entity.id) : undefined
      )
      .groupBy(
        contractors.id,
        contractors.legalName,
        contractors.dba,
        contractors.role,
        contractors.avatarUrl
      )
      .having(
        sql`coalesce(sum(case when ${transactions.amountCents} < 0 then -${transactions.amountCents} else 0 end), 0) > 0`
      )
      .orderBy(
        desc(
          sql`coalesce(sum(case when ${transactions.amountCents} < 0 then -${transactions.amountCents} else 0 end), 0)`
        )
      )
      .limit(8),
    db
      .select({
        id: employees.id,
        legalName: employees.legalName,
        kind: employees.employeeKind,
        avatarUrl: employees.avatarUrl,
        paidCents: sql<number>`coalesce(sum(case when ${transactions.amountCents} < 0 then -${transactions.amountCents} else 0 end), 0)::int`,
      })
      .from(employees)
      .leftJoin(
        transactions,
        and(
          eq(transactions.employeeId, employees.id),
          gte(transactions.postedDate, yearStart),
          lte(transactions.postedDate, yearEnd)
        )
      )
      .where(
        scope.entity ? eq(employees.entityId, scope.entity.id) : undefined
      )
      .groupBy(
        employees.id,
        employees.legalName,
        employees.employeeKind,
        employees.avatarUrl
      )
      .having(
        sql`coalesce(sum(case when ${transactions.amountCents} < 0 then -${transactions.amountCents} else 0 end), 0) > 0`
      )
      .orderBy(
        desc(
          sql`coalesce(sum(case when ${transactions.amountCents} < 0 then -${transactions.amountCents} else 0 end), 0)`
        )
      )
      .limit(6),
    // Spend classification — split outflow into buckets we already know
    db
      .select({
        contractorCents: sql<number>`coalesce(sum(case when ${transactions.contractorId} is not null and ${transactions.amountCents} < 0 then -${transactions.amountCents} else 0 end), 0)::int`,
        employeeCents: sql<number>`coalesce(sum(case when ${transactions.employeeId} is not null and ${transactions.amountCents} < 0 then -${transactions.amountCents} else 0 end), 0)::int`,
        transferCents: sql<number>`coalesce(sum(case when ${transactions.isInterEntityTransfer} and ${transactions.amountCents} < 0 then -${transactions.amountCents} else 0 end), 0)::int`,
        personalCents: sql<number>`coalesce(sum(case when ${transactions.notes} ilike '%[personal]%' and ${transactions.amountCents} < 0 then -${transactions.amountCents} else 0 end), 0)::int`,
        savingsMoveCents: sql<number>`coalesce(sum(case when ${transactions.notes} ilike '%[intra-PTC savings move]%' and ${transactions.amountCents} < 0 then -${transactions.amountCents} else 0 end), 0)::int`,
        atmCashCents: sql<number>`coalesce(sum(case when ${transactions.notes} ilike '%[ATM cash]%' and ${transactions.amountCents} < 0 then -${transactions.amountCents} else 0 end), 0)::int`,
      })
      .from(transactions)
      .where(where),
  ]);

  // ───── Compute monthly chart data ─────
  const months: { label: string; inflow: number; outflow: number }[] = [];
  for (let m = 1; m <= 12; m++) {
    const mm = String(m).padStart(2, "0");
    const tag = `${year}-${mm}`;
    const row = perMonth.find((r) => r.month === tag);
    months.push({
      label: new Date(`${tag}-15`).toLocaleString("en-US", { month: "short" }),
      inflow: row?.inflow ?? 0,
      outflow: row?.outflow ?? 0,
    });
  }
  const maxMonthBar = Math.max(
    1,
    ...months.map((m) => Math.max(m.inflow, m.outflow))
  );

  // Classification residual: outflow not accounted for by any tag
  const cls = classification;
  const taggedOutflow =
    cls.contractorCents +
    cls.employeeCents +
    cls.transferCents +
    cls.personalCents +
    cls.savingsMoveCents +
    cls.atmCashCents;
  const untaggedOutflow = Math.max(0, totals.outflow - taggedOutflow);

  // Top contractor max for horizontal bar chart
  const topContractorMax = Math.max(
    1,
    ...topContractors.map((c) => c.paidCents)
  );

  // Per-entity max for the per-entity bars (use outflow as scale baseline)
  const perEntityMax = Math.max(
    1,
    ...perEntity.map((e) => Math.max(e.inflow, e.outflow))
  );

  const yearOptions = [cur, cur - 1, cur - 2];

  return (
    <Page>
      <PageHeader
        title={`Reports — ${year}`}
        subtitle={
          scope.entity
            ? `Scoped to ${scope.entity.name}. Executive view of P&L, spend, and cash-flow trends.`
            : "All entities combined. Executive view of P&L, spend, and cash-flow trends."
        }
        actions={
          <div className="flex gap-1">
            {yearOptions.map((y) => (
              <Link
                key={y}
                href={`/reports?year=${y}`}
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

      {totals.count === 0 ? (
        <EmptyState
          title="No transactions to report on"
          description={`Nothing posted in ${year}. Run the backfill or drop a statement.`}
        />
      ) : (
        <>
          {/* ───── KPI tiles ───── */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile
              label="Transactions"
              value={totals.count.toLocaleString()}
            />
            <StatTile
              label="Inflow"
              value={<Money cents={totals.inflow} />}
              tone="success"
            />
            <StatTile
              label="Outflow"
              value={<Money cents={totals.outflow} />}
              tone="danger"
            />
            <StatTile
              label="Net"
              value={<Money cents={totals.net} signed />}
              tone={totals.net >= 0 ? "success" : "danger"}
            />
          </div>

          {/* ───── Monthly cash flow ───── */}
          <section>
            <SectionHeader title="Monthly cash flow" hint={`${year}`} />
            <Card className="px-6 py-6">
              <div className="grid grid-cols-12 gap-2 items-end h-56">
                {months.map((m, i) => {
                  const inflowH = (m.inflow / maxMonthBar) * 100;
                  const outflowH = (m.outflow / maxMonthBar) * 100;
                  return (
                    <div key={i} className="flex flex-col items-center gap-1 h-full">
                      <div className="flex-1 w-full flex items-end gap-1">
                        <div
                          className="flex-1 rounded-t bg-[var(--color-sage,#5e7d66)] transition-all"
                          style={{ height: `${inflowH}%` }}
                          title={`Inflow ${formatMoney(m.inflow)}`}
                        />
                        <div
                          className="flex-1 rounded-t bg-[var(--danger)] opacity-80 transition-all"
                          style={{ height: `${outflowH}%` }}
                          title={`Outflow ${formatMoney(m.outflow)}`}
                        />
                      </div>
                      <div className="text-[10px] text-[var(--muted)] font-medium">
                        {m.label}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 flex justify-center gap-5 text-xs text-[var(--muted)]">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-3 h-3 rounded-sm bg-[var(--color-sage,#5e7d66)]" />
                  Inflow
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-3 h-3 rounded-sm bg-[var(--danger)] opacity-80" />
                  Outflow
                </span>
              </div>
            </Card>
          </section>

          {/* ───── Per-entity P&L (only when unscoped) ───── */}
          {!scope.entity && (
            <section>
              <SectionHeader title="P&L per entity" />
              <Card>
                <ul className="divide-y divide-[var(--border)]">
                  {perEntity.map((e) => {
                    const inW = (e.inflow / perEntityMax) * 100;
                    const outW = (e.outflow / perEntityMax) * 100;
                    return (
                      <li key={e.entityId} className="px-5 py-4">
                        <div className="flex items-baseline justify-between gap-3 mb-2">
                          <Link
                            href={`/entities/${e.slug}`}
                            className="font-medium hover:underline"
                          >
                            {e.name}
                          </Link>
                          <span className="text-sm font-semibold">
                            <Money cents={e.net} signed />
                          </span>
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] uppercase tracking-[0.14em] text-[var(--muted)] w-14 shrink-0">
                              Inflow
                            </span>
                            <div className="flex-1 bg-[var(--surface-warm)] rounded-full h-2 overflow-hidden">
                              <div
                                className="h-full bg-[var(--color-sage,#5e7d66)]"
                                style={{ width: `${inW}%` }}
                              />
                            </div>
                            <span className="text-xs tabular w-24 text-right text-[var(--body)]">
                              {formatMoney(e.inflow)}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] uppercase tracking-[0.14em] text-[var(--muted)] w-14 shrink-0">
                              Outflow
                            </span>
                            <div className="flex-1 bg-[var(--surface-warm)] rounded-full h-2 overflow-hidden">
                              <div
                                className="h-full bg-[var(--danger)] opacity-80"
                                style={{ width: `${outW}%` }}
                              />
                            </div>
                            <span className="text-xs tabular w-24 text-right text-[var(--body)]">
                              {formatMoney(e.outflow)}
                            </span>
                          </div>
                        </div>
                        <div className="mt-1.5 text-[10px] text-[var(--muted)]">
                          {e.count.toLocaleString()} txns
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            </section>
          )}

          {/* ───── Outflow breakdown ───── */}
          <section>
            <SectionHeader title="Where the money went" />
            <Card className="px-6 py-5">
              <SpendBar
                rows={[
                  { label: "Contractors (1099)", cents: cls.contractorCents, color: "var(--color-sage,#5e7d66)" },
                  { label: "Employees (W-2)", cents: cls.employeeCents, color: "#3d6353" },
                  { label: "Inter-entity transfers", cents: cls.transferCents, color: "var(--gold)" },
                  { label: "Personal / owner draws", cents: cls.personalCents, color: "#9a7d52" },
                  { label: "Intra-PTC savings", cents: cls.savingsMoveCents, color: "#b9a984" },
                  { label: "ATM cash", cents: cls.atmCashCents, color: "#cdb88a" },
                  { label: "Untagged operations", cents: untaggedOutflow, color: "#cbd5e1" },
                ].filter((r) => r.cents > 0)}
                total={totals.outflow}
              />
            </Card>
          </section>

          {/* ───── Top contractors + employees ───── */}
          <div className="grid gap-6 lg:grid-cols-2">
            <section>
              <SectionHeader
                title="Top contractors by spend"
                hint={
                  <Link
                    href="/contractors"
                    className="text-[var(--accent)] hover:underline"
                  >
                    View all →
                  </Link>
                }
              />
              {topContractors.length === 0 ? (
                <EmptyState
                  title="No 1099 spend tagged"
                  description="Tag transactions to contractors on /transactions or rerun npm run autotag:contractors."
                />
              ) : (
                <Card>
                  <ul className="divide-y divide-[var(--border)]">
                    {topContractors.map((c) => {
                      const w = (c.paidCents / topContractorMax) * 100;
                      const display = c.dba ?? c.legalName;
                      return (
                        <li key={c.id} className="px-5 py-3.5">
                          <div className="flex items-baseline justify-between gap-3 mb-1.5">
                            <div className="min-w-0">
                              <div className="font-medium truncate">{display}</div>
                              {c.role && (
                                <div className="text-xs text-[var(--muted)] truncate">
                                  {c.role}
                                </div>
                              )}
                            </div>
                            <span className="font-semibold tabular whitespace-nowrap">
                              <Money cents={c.paidCents} />
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 bg-[var(--surface-warm)] rounded-full h-1.5 overflow-hidden">
                              <div
                                className="h-full bg-[var(--color-sage,#5e7d66)]"
                                style={{ width: `${w}%` }}
                              />
                            </div>
                            <span className="text-[10px] text-[var(--muted)] tabular w-12 text-right">
                              {c.txnCount} txn
                            </span>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </Card>
              )}
            </section>

            <section>
              <SectionHeader
                title="Payroll"
                hint={
                  <Link
                    href="/employees"
                    className="text-[var(--accent)] hover:underline"
                  >
                    View all →
                  </Link>
                }
              />
              {topEmployees.length === 0 ? (
                <EmptyState
                  title="No W-2 / kid wages tagged"
                  description="Tag a payroll transaction to an employee on /transactions."
                />
              ) : (
                <Card>
                  <ul className="divide-y divide-[var(--border)]">
                    {topEmployees.map((e) => {
                      const max = Math.max(
                        1,
                        ...topEmployees.map((x) => x.paidCents)
                      );
                      const w = (e.paidCents / max) * 100;
                      return (
                        <li key={e.id} className="px-5 py-3.5">
                          <div className="flex items-baseline justify-between gap-3 mb-1.5">
                            <div className="min-w-0 flex items-center gap-2">
                              <span className="font-medium truncate">
                                {e.legalName}
                              </span>
                              <StatusPill tone="accent">
                                {e.kind === "minor_child" ? "Kid" : "W-2"}
                              </StatusPill>
                            </div>
                            <span className="font-semibold tabular whitespace-nowrap">
                              <Money cents={e.paidCents} />
                            </span>
                          </div>
                          <div className="flex-1 bg-[var(--surface-warm)] rounded-full h-1.5 overflow-hidden">
                            <div
                              className="h-full bg-[var(--color-sage,#5e7d66)]"
                              style={{ width: `${w}%` }}
                            />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </Card>
              )}
            </section>
          </div>
        </>
      )}
    </Page>
  );
}

function SpendBar({
  rows,
  total,
}: {
  rows: { label: string; cents: number; color: string }[];
  total: number;
}) {
  return (
    <div>
      <div className="flex w-full h-3 rounded-full overflow-hidden bg-[var(--surface-warm)]">
        {rows.map((r) => {
          const pct = total > 0 ? (r.cents / total) * 100 : 0;
          if (pct === 0) return null;
          return (
            <div
              key={r.label}
              style={{ width: `${pct}%`, background: r.color }}
              title={`${r.label} — ${formatMoney(r.cents)} (${pct.toFixed(1)}%)`}
            />
          );
        })}
      </div>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 text-sm">
        {rows.map((r) => {
          const pct = total > 0 ? (r.cents / total) * 100 : 0;
          return (
            <li key={r.label} className="flex items-center gap-2">
              <span
                className="inline-block w-3 h-3 rounded-sm shrink-0"
                style={{ background: r.color }}
              />
              <span className="flex-1 text-[var(--body)]">{r.label}</span>
              <span className="tabular text-[var(--muted)]">
                {formatMoney(r.cents)} · {pct.toFixed(1)}%
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
