import Link from "next/link";
import { db } from "@/lib/db";
import {
  transactions,
  bankAccounts,
  entities,
  contractors,
  employees,
} from "@/lib/db/schema";
import { getActiveScope } from "@/lib/scope";
import {
  and,
  eq,
  gte,
  lte,
  or,
  ilike,
  desc,
  sql,
  asc,
  isNotNull,
} from "drizzle-orm";
import {
  Page,
  PageHeader,
  Card,
  StatTile,
  EmptyState,
  Money,
} from "@/components/ui";
import { TransactionFilters } from "./_filters";
import { TransactionTable } from "./_table";
import { TransactionDrawer } from "./_drawer";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

type SP = Promise<{
  account?: string;
  from?: string;
  to?: string;
  q?: string;
  page?: string;
  txn?: string;
}>;

function parsePage(raw: string | undefined): number {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

function isISODate(s: string | undefined): s is string {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

// Parse "2300" / "2,300" / "$2,300" / "2300.00" → 230000 cents.
// Returns null if not a clean money-shaped string.
function parseAmountCents(s: string): number | null {
  const cleaned = s.replace(/[$,\s]/g, "");
  if (!/^-?\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n === 0) return null;
  return Math.round(Math.abs(n) * 100);
}

function buildBaseParams(sp: Awaited<SP>): URLSearchParams {
  // Everything EXCEPT ?txn — used for "back" navigation from the drawer
  // and for preserving filter state when opening a row.
  const p = new URLSearchParams();
  if (sp.account) p.set("account", sp.account);
  if (sp.from) p.set("from", sp.from);
  if (sp.to) p.set("to", sp.to);
  if (sp.q) p.set("q", sp.q);
  if (sp.page) p.set("page", sp.page);
  return p;
}

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: SP;
}) {
  const sp = await searchParams;
  const scope = await getActiveScope();
  const page = parsePage(sp.page);
  const offset = (page - 1) * PAGE_SIZE;

  // ───── Filters ─────
  const conditions = [];
  if (scope.entity) conditions.push(eq(transactions.entityId, scope.entity.id));
  if (sp.account) conditions.push(eq(transactions.bankAccountId, sp.account));
  if (isISODate(sp.from)) conditions.push(gte(transactions.postedDate, sp.from));
  if (isISODate(sp.to)) conditions.push(lte(transactions.postedDate, sp.to));
  if (sp.q) {
    const pat = `%${sp.q}%`;
    const amountCents = parseAmountCents(sp.q);
    const orConditions = [
      ilike(transactions.normalizedMerchant, pat),
      ilike(transactions.rawDescription, pat),
    ];
    if (amountCents != null) {
      // Match either sign: a search for "2300" finds both a $2,300 expense
      // (stored -230000) and a $2,300 deposit (stored +230000).
      orConditions.push(eq(transactions.amountCents, amountCents));
      orConditions.push(eq(transactions.amountCents, -amountCents));
    }
    conditions.push(or(...orConditions)!);
  }
  const where = conditions.length ? and(...conditions) : undefined;

  // ───── Account dropdown source (scoped) ─────
  const accountsQuery = scope.entity
    ? db
        .select({ id: bankAccounts.id, displayName: bankAccounts.displayName })
        .from(bankAccounts)
        .where(eq(bankAccounts.entityId, scope.entity.id))
        .orderBy(asc(bankAccounts.displayName))
    : db
        .select({ id: bankAccounts.id, displayName: bankAccounts.displayName })
        .from(bankAccounts)
        .orderBy(asc(bankAccounts.displayName));

  // ───── Stats + rows + total in parallel ─────
  const [accountsForFilter, [stats], rows] = await Promise.all([
    accountsQuery,
    db
      .select({
        count: sql<number>`count(*)::int`,
        inflow: sql<number>`coalesce(sum(case when ${transactions.amountCents} > 0 then ${transactions.amountCents} else 0 end), 0)::int`,
        outflow: sql<number>`coalesce(sum(case when ${transactions.amountCents} < 0 then ${transactions.amountCents} else 0 end), 0)::int`,
        net: sql<number>`coalesce(sum(${transactions.amountCents}), 0)::int`,
        taggedContractor: sql<number>`coalesce(sum(case when ${transactions.contractorId} is not null then 1 else 0 end), 0)::int`,
        taggedEmployee: sql<number>`coalesce(sum(case when ${transactions.employeeId} is not null then 1 else 0 end), 0)::int`,
      })
      .from(transactions)
      .where(where!),
    db
      .select({
        id: transactions.id,
        postedDate: transactions.postedDate,
        amountCents: transactions.amountCents,
        normalizedMerchant: transactions.normalizedMerchant,
        rawDescription: transactions.rawDescription,
        isInterEntityTransfer: transactions.isInterEntityTransfer,
        notes: transactions.notes,
        accountName: bankAccounts.displayName,
        entityName: entities.name,
        contractorName: contractors.legalName,
        employeeName: employees.legalName,
        employeeKind: employees.employeeKind,
      })
      .from(transactions)
      .innerJoin(bankAccounts, eq(bankAccounts.id, transactions.bankAccountId))
      .innerJoin(entities, eq(entities.id, transactions.entityId))
      .leftJoin(contractors, eq(contractors.id, transactions.contractorId))
      .leftJoin(employees, eq(employees.id, transactions.employeeId))
      .where(where!)
      .orderBy(desc(transactions.postedDate))
      .limit(PAGE_SIZE)
      .offset(offset),
  ]);

  const totalPages = Math.max(1, Math.ceil(stats.count / PAGE_SIZE));
  const start = stats.count === 0 ? 0 : offset + 1;
  const end = Math.min(offset + PAGE_SIZE, stats.count);

  const baseParams = buildBaseParams(sp);
  const baseQueryString = baseParams.toString();
  const returnHref = baseQueryString
    ? `/transactions?${baseQueryString}`
    : "/transactions";

  function pageHref(p: number): string {
    const params = new URLSearchParams(baseQueryString);
    params.delete("page");
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return qs ? `/transactions?${qs}` : "/transactions";
  }

  const tableRows = rows.map((r) => ({
    id: r.id,
    postedDate: r.postedDate,
    amountCents: r.amountCents,
    normalizedMerchant: r.normalizedMerchant,
    rawDescription: r.rawDescription,
    accountName: r.accountName,
    entityName: r.entityName,
    contractorName: r.contractorName,
    employeeName: r.employeeName,
    employeeKind: r.employeeKind,
    isInterEntityTransfer: r.isInterEntityTransfer,
    hasNotes: !!(r.notes && r.notes.trim()),
  }));

  return (
    <Page>
      <PageHeader
        title="Transactions"
        subtitle={
          scope.entity
            ? `Scoped to ${scope.entity.name}.`
            : "All entities. Use the switcher to scope."
        }
      />

      <div className="mb-6">
        <TransactionFilters accounts={accountsForFilter} />
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-4">
        <StatTile
          label="Count"
          value={stats.count.toLocaleString()}
          hint={
            stats.taggedContractor || stats.taggedEmployee
              ? `${stats.taggedContractor} 1099 · ${stats.taggedEmployee} W-2`
              : undefined
          }
        />
        <StatTile
          label="Inflow"
          value={<Money cents={stats.inflow} />}
          tone="success"
        />
        <StatTile
          label="Outflow"
          value={<Money cents={stats.outflow} />}
          tone="danger"
        />
        <StatTile
          label="Net"
          value={<Money cents={stats.net} signed />}
          tone={stats.net >= 0 ? "success" : "danger"}
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="No transactions match"
          description={
            stats.count === 0 && !sp.account && !sp.from && !sp.to && !sp.q
              ? "Run the cobbvault backfill or drop a statement to ingest."
              : "Adjust the filters to widen the search."
          }
        />
      ) : (
        <Card>
          <TransactionTable
            rows={tableRows}
            showEntityColumn={!scope.entity}
            baseQueryString={baseQueryString}
          />
        </Card>
      )}

      {stats.count > 0 && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-sm">
          <div className="text-[var(--muted)] tabular">
            Showing {start.toLocaleString()}&ndash;{end.toLocaleString()} of{" "}
            {stats.count.toLocaleString()}
          </div>
          <div className="flex items-center gap-2">
            {page > 1 ? (
              <Link
                href={pageHref(page - 1)}
                className="rounded-md border border-[var(--border)] px-3 py-1.5 hover:bg-[var(--surface)]"
              >
                ← Newer
              </Link>
            ) : (
              <span className="rounded-md border border-[var(--border)] px-3 py-1.5 text-[var(--muted)] opacity-50">
                ← Newer
              </span>
            )}
            <span className="tabular text-[var(--muted)]">
              Page {page} / {totalPages}
            </span>
            {page < totalPages ? (
              <Link
                href={pageHref(page + 1)}
                className="rounded-md border border-[var(--border)] px-3 py-1.5 hover:bg-[var(--surface)]"
              >
                Older →
              </Link>
            ) : (
              <span className="rounded-md border border-[var(--border)] px-3 py-1.5 text-[var(--muted)] opacity-50">
                Older →
              </span>
            )}
          </div>
        </div>
      )}

      {sp.txn && (
        <TransactionDrawer txnId={sp.txn} returnHref={returnHref} />
      )}
    </Page>
  );
}
