import Link from "next/link";
import { db } from "@/lib/db";
import { taxDeadlines, entities } from "@/lib/db/schema";
import { eq, and, gte, lte, asc, ne, sql } from "drizzle-orm";
import { getActiveScope } from "@/lib/scope";
import {
  Page,
  PageHeader,
  Card,
  StatTile,
  EmptyState,
  StatusPill,
  Callout,
} from "@/components/ui";
import { StatusActions } from "./_client";

export const dynamic = "force-dynamic";

const KIND_LABEL: Record<string, string> = {
  "1120_s": "Form 1120-S",
  "1040": "Form 1040",
  "quarterly_estimated": "Quarterly estimated",
  "state_annual": "GA annual report",
  "1099_due": "1099-NEC",
  "w2_due": "W-2",
  "941_quarterly": "Form 941",
  "940_annual": "Form 940 (FUTA)",
  "eftps_deposit": "EFTPS deposit",
  "ga_g7_withholding": "GA G-7 withholding",
  "ga_suta": "GA SUTA (DOL-4N)",
  "futa_deposit": "FUTA deposit",
  "llc_renewal": "LLC renewal",
  "property_tax": "Property tax",
  "insurance_renewal": "Insurance renewal",
  "mortgage_due": "Mortgage payment",
  "w9_collection": "W-9 collection",
  "registered_agent_renewal": "Registered agent",
};

const SYSTEM_FOR_KIND: Record<string, string> = {
  "1120_s": "IRS",
  "1040": "IRS",
  "quarterly_estimated": "IRS / EFTPS",
  "state_annual": "GA Secretary of State",
  "1099_due": "IRS / SSA",
  "w2_due": "SSA",
  "941_quarterly": "EFTPS",
  "940_annual": "EFTPS",
  "eftps_deposit": "EFTPS",
  "ga_g7_withholding": "Georgia Tax Center",
  "ga_suta": "GA DOL",
  "futa_deposit": "EFTPS",
};

type SP = Promise<{
  show?: string; // 'open' | 'all' | 'overdue' | 'paid'
  kind?: string; // filter by kind
  year?: string;
}>;

function daysUntil(due: string, today: Date): number {
  const dueD = new Date(due + "T00:00:00Z");
  const diff = dueD.getTime() - today.getTime();
  return Math.round(diff / 86_400_000);
}

export default async function DeadlinesPage({
  searchParams,
}: {
  searchParams: SP;
}) {
  const sp = await searchParams;
  const scope = await getActiveScope();
  const today = new Date();
  const todayISO = today.toISOString().slice(0, 10);
  const showRaw = sp.show ?? "open";

  // Auto-flip status=open & dueDate < today to overdue (live, not persisted)
  // Keeping it computed lets a row re-flip when status is later set back to
  // 'open' without a separate cron.
  const conditions = [];
  if (scope.entity)
    conditions.push(eq(taxDeadlines.entityId, scope.entity.id));
  if (sp.kind) conditions.push(eq(taxDeadlines.kind, sp.kind));
  if (sp.year) {
    conditions.push(gte(taxDeadlines.dueDate, `${sp.year}-01-01`));
    conditions.push(lte(taxDeadlines.dueDate, `${sp.year}-12-31`));
  }
  if (showRaw === "open") {
    conditions.push(ne(taxDeadlines.status, "paid"));
  } else if (showRaw === "paid") {
    conditions.push(eq(taxDeadlines.status, "paid"));
  } else if (showRaw === "overdue") {
    conditions.push(ne(taxDeadlines.status, "paid"));
    conditions.push(lte(taxDeadlines.dueDate, todayISO));
  }

  const where = conditions.length ? and(...conditions) : undefined;

  const rows = await db
    .select({
      deadline: taxDeadlines,
      entityName: entities.name,
    })
    .from(taxDeadlines)
    .leftJoin(entities, eq(entities.id, taxDeadlines.entityId))
    .where(where!)
    .orderBy(asc(taxDeadlines.dueDate))
    .limit(300);

  const distinctKinds = await db
    .selectDistinct({ kind: taxDeadlines.kind })
    .from(taxDeadlines);

  // Stats: open total, overdue, this month, next 30 days
  const allOpen = await db
    .select({
      id: taxDeadlines.id,
      dueDate: taxDeadlines.dueDate,
      status: taxDeadlines.status,
    })
    .from(taxDeadlines)
    .where(ne(taxDeadlines.status, "paid"));

  const overdueCount = allOpen.filter((r) => r.dueDate < todayISO).length;
  const next30 = allOpen.filter((r) => {
    const d = daysUntil(r.dueDate, today);
    return d >= 0 && d <= 30;
  }).length;

  return (
    <Page>
      <PageHeader
        title="Tax deadlines"
        subtitle={
          scope.entity
            ? `Scoped to ${scope.entity.name}.`
            : "All entities."
        }
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <StatTile
          label="Open"
          value={allOpen.length.toLocaleString()}
          hint={`${rows.length} match current filter`}
        />
        <StatTile
          label="Overdue"
          value={overdueCount.toLocaleString()}
          tone={overdueCount > 0 ? "danger" : "neutral"}
        />
        <StatTile
          label="Next 30 days"
          value={next30.toLocaleString()}
          tone={next30 > 0 ? "warning" : "neutral"}
        />
      </div>

      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        <FilterChip label="Open" param="show" value={undefined} active={showRaw === "open"} />
        <FilterChip label="Overdue" param="show" value="overdue" active={showRaw === "overdue"} />
        <FilterChip label="Paid" param="show" value="paid" active={showRaw === "paid"} />
        <FilterChip label="All" param="show" value="all" active={showRaw === "all"} />
        <span className="text-[var(--muted)]">·</span>
        {distinctKinds.map((k) => (
          <FilterChip
            key={k.kind}
            label={KIND_LABEL[k.kind] ?? k.kind}
            param="kind"
            value={k.kind}
            active={sp.kind === k.kind}
            replace
          />
        ))}
        {sp.kind && (
          <FilterChip label="× clear kind" param="kind" value={undefined} active={false} />
        )}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="No deadlines match"
          description={
            <>
              Run{" "}
              <code className="rounded bg-[var(--surface)] px-1 text-xs">
                npm run seed:deadlines
              </code>{" "}
              to auto-create the standard ones (1120-S, 1040, quarterlies,
              941, 940, EFTPS deposits, G-7, SUTA, 1099/W-2, GA annual report).
            </>
          }
        />
      ) : (
        <Card>
          <ul className="divide-y divide-[var(--border)]">
            {rows.map((r) => {
              const d = r.deadline;
              const days = daysUntil(d.dueDate, today);
              const overdue = d.status !== "paid" && days < 0;
              const upcoming = d.status !== "paid" && days >= 0 && days <= 30;
              return (
                <li
                  key={d.id}
                  className={`px-4 py-3 ${
                    overdue
                      ? "bg-rose-50/40 dark:bg-rose-950/10"
                      : upcoming
                        ? "bg-amber-50/40 dark:bg-amber-950/10"
                        : ""
                  }`}
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-3">
                    <div className="text-sm">
                      <span className="tabular font-medium">
                        {d.dueDate}
                      </span>
                      <span className="ml-2 text-xs text-[var(--muted)]">
                        {overdue
                          ? `${Math.abs(days)}d overdue`
                          : days === 0
                            ? "today"
                            : `in ${days}d`}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <StatusPill tone="accent">
                        {KIND_LABEL[d.kind] ?? d.kind}
                      </StatusPill>
                      {SYSTEM_FOR_KIND[d.kind] && (
                        <StatusPill tone="neutral">
                          {SYSTEM_FOR_KIND[d.kind]}
                        </StatusPill>
                      )}
                      {d.status === "paid" ? (
                        <StatusPill tone="success">
                          Paid{d.paidDate ? ` ${d.paidDate}` : ""}
                        </StatusPill>
                      ) : d.status === "scheduled" ? (
                        <StatusPill tone="accent">Scheduled</StatusPill>
                      ) : overdue ? (
                        <StatusPill tone="danger">Overdue</StatusPill>
                      ) : (
                        <StatusPill tone="neutral">Open</StatusPill>
                      )}
                    </div>
                  </div>
                  <div className="mt-1 text-sm text-[var(--muted)]">
                    {r.entityName ?? "All entities"}
                  </div>
                  {d.notes && (
                    <div className="mt-1 text-xs text-[var(--muted)]">
                      {d.notes}
                    </div>
                  )}
                  <div className="mt-2">
                    <StatusActions id={d.id} status={d.status} />
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <div className="mt-10">
        <Callout title="External systems Lance files through" tone="info">
          <ul className="mt-1 list-disc space-y-1 pl-5">
            <li>
              <strong>EFTPS</strong> — Form 941 federal employment tax,
              monthly deposits (SSA + Medicare + federal withholding),
              Form 940 FUTA
            </li>
            <li>
              <strong>Georgia Tax Center</strong> — Form G-7 state
              withholding (quarterly)
            </li>
            <li>
              <strong>GA DOL</strong> — Form DOL-4N SUTA (quarterly)
            </li>
            <li>
              <strong>IRS</strong> — 1120-S, 1040, 1099-NEC, quarterly
              estimateds
            </li>
            <li>
              <strong>GA Secretary of State</strong> — LLC annual report
              (Apr 1)
            </li>
          </ul>
        </Callout>
      </div>
    </Page>
  );
}

function FilterChip({
  label,
  param,
  value,
  active,
  replace = false,
}: {
  label: string;
  param: string;
  value: string | undefined;
  active: boolean;
  replace?: boolean;
}) {
  const params = new URLSearchParams();
  if (value !== undefined) params.set(param, value);
  if (!replace) {
    // preserve other filters
  }
  const href = params.toString() ? `/deadlines?${params.toString()}` : "/deadlines";
  return (
    <Link
      href={href}
      className={`rounded-full border px-2.5 py-0.5 text-xs ${
        active
          ? "border-[var(--foreground)] bg-[var(--foreground)] text-[var(--background)]"
          : "border-[var(--border)] text-[var(--muted)] hover:bg-[var(--surface)]"
      }`}
    >
      {label}
    </Link>
  );
}
