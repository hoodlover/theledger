import {
  Page,
  PageHeader,
  StatTile,
  Card,
  CardHeader,
  CardBody,
  Callout,
} from "@/components/ui";
import { db } from "@/lib/db";
import {
  entities,
  bankAccounts,
  transactions,
  statementImports,
  taxDeadlines,
  receipts,
} from "@/lib/db/schema";
import { getActiveScope } from "@/lib/scope";
import { eq, count, and, sql } from "drizzle-orm";
import Link from "next/link";

export const dynamic = "force-dynamic";

const TILES = [
  { href: "/entities", label: "Entities", desc: "Path to Change, PTC Havens, H&L holdings, CFS, personal" },
  { href: "/accounts", label: "Accounts", desc: "Bluevine sub-accounts, BofA, card holders" },
  { href: "/transactions", label: "Transactions", desc: "The canonical ledger" },
  { href: "/contractors", label: "1099 contractors", desc: "YTD totals, W-9 status" },
  { href: "/employees", label: "Employees", desc: "W-2s + minor kids with FICA-exempt headroom" },
  { href: "/transfers", label: "Inter-entity transfers", desc: "Rent, cleaning, kid wages" },
  { href: "/receipts", label: "Receipts", desc: "Drop folder + phone upload + auto-match" },
  { href: "/imports", label: "Statement imports", desc: "Drop a PDF, txns land under the right entity" },
];

export default async function Home() {
  const scope = await getActiveScope();
  const entityFilter = scope.entity
    ? eq(transactions.entityId, scope.entity.id)
    : undefined;

  const [
    [{ value: entityCount }],
    [{ value: accountCount }],
    [{ value: txnCount }],
    [{ value: receiptCount }],
    [{ value: openDeadlineCount }],
  ] = await Promise.all([
    db.select({ value: count() }).from(entities),
    scope.entity
      ? db
          .select({ value: count() })
          .from(bankAccounts)
          .where(eq(bankAccounts.entityId, scope.entity.id))
      : db.select({ value: count() }).from(bankAccounts),
    scope.entity
      ? db.select({ value: count() }).from(transactions).where(entityFilter!)
      : db.select({ value: count() }).from(transactions),
    scope.entity
      ? db
          .select({ value: count() })
          .from(receipts)
          .where(eq(receipts.entityId, scope.entity.id))
      : db.select({ value: count() }).from(receipts),
    scope.entity
      ? db
          .select({ value: count() })
          .from(taxDeadlines)
          .where(
            and(
              eq(taxDeadlines.entityId, scope.entity.id),
              eq(taxDeadlines.status, "open")
            )
          )
      : db
          .select({ value: count() })
          .from(taxDeadlines)
          .where(eq(taxDeadlines.status, "open")),
  ]);

  return (
    <Page>
      <PageHeader
        title="Dashboard"
        subtitle={
          scope.entity
            ? `Scoped to ${scope.entity.name}. Switch in the top right to widen.`
            : "All entities. Use the switcher to scope to one."
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Entities" value={entityCount} hint="Six seeded" />
        <StatTile
          label="Accounts"
          value={accountCount}
          hint={scope.entity ? "Scoped" : "All entities"}
        />
        <StatTile
          label="Transactions"
          value={txnCount}
          hint={txnCount === 0 ? "Drop a statement to ingest" : undefined}
        />
        <StatTile
          label="Open deadlines"
          value={openDeadlineCount}
          tone={openDeadlineCount > 0 ? "warning" : "neutral"}
          hint={openDeadlineCount === 0 ? "Auto-seeded in v1" : undefined}
        />
      </div>

      <div className="mt-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
          Sections
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {TILES.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className="group rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 transition hover:border-[var(--foreground)]"
            >
              <div className="text-sm font-semibold">{t.label}</div>
              <div className="mt-1 text-xs text-[var(--muted)]">{t.desc}</div>
            </Link>
          ))}
        </div>
      </div>

      <div className="mt-10">
        <Callout title="Next up" tone="info">
          Receipts &amp; statements already live in cobbvault&rsquo;s Vercel Blob.
          Next chunk: share the blob token and backfill historical data so
          /contractors and /transactions surface real 1099 totals.
        </Callout>
      </div>
    </Page>
  );
}
