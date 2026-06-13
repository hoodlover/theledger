import Link from "next/link";
import {
  Page,
  PageHeader,
  StatTile,
  SectionHeader,
  EmptyState,
  StatusPill,
  Money,
} from "@/components/ui";
import { db } from "@/lib/db";
import {
  receipts,
  manualEntries,
  transactions,
  entities,
  bankAccounts,
  users,
  interEntityTransfers,
} from "@/lib/db/schema";
import { getActiveScope } from "@/lib/scope";
import {
  and,
  eq,
  isNull,
  sql,
  desc,
  not,
  or,
  asc,
  gte,
  lte,
} from "drizzle-orm";
import { ReceiptCandidateCard, ManualCandidateCard } from "./_client";

export const dynamic = "force-dynamic";

const RECEIPT_AMOUNT_TOLERANCE_CENTS = 50;
const MATCH_DATE_WINDOW_DAYS = 5;

function shiftDate(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export default async function ReconcilePage() {
  const scope = await getActiveScope();
  const scopeFilter = scope.entity ? eq(receipts.entityId, scope.entity.id) : undefined;
  const meScopeFilter = scope.entity
    ? eq(manualEntries.entityId, scope.entity.id)
    : undefined;

  // ───── Pull unmatched receipts ─────
  // Exclude those soft-dismissed via match_method='none'
  const unmatchedReceipts = await db
    .select({
      id: receipts.id,
      merchant: receipts.merchant,
      purchaseDate: receipts.purchaseDate,
      totalCents: receipts.totalCents,
      blobUrl: receipts.blobUrl,
      entityId: receipts.entityId,
      entityName: entities.name,
    })
    .from(receipts)
    .innerJoin(entities, eq(entities.id, receipts.entityId))
    .where(
      and(
        isNull(receipts.matchedTransactionId),
        or(isNull(receipts.matchMethod), not(eq(receipts.matchMethod, "none"))),
        scopeFilter
      )!
    )
    .orderBy(desc(receipts.createdAt))
    .limit(30);

  // ───── Pull unmatched manual entries ─────
  const unmatchedManual = await db
    .select({
      id: manualEntries.id,
      date: manualEntries.date,
      amountCents: manualEntries.amountCents,
      payeeText: manualEntries.payeeText,
      notes: manualEntries.notes,
      entityId: manualEntries.entityId,
      entityName: entities.name,
      enteredBy: users.name,
    })
    .from(manualEntries)
    .innerJoin(entities, eq(entities.id, manualEntries.entityId))
    .innerJoin(users, eq(users.id, manualEntries.enteredByUserId))
    .where(and(isNull(manualEntries.matchedTransactionId), meScopeFilter)!)
    .orderBy(desc(manualEntries.createdAt))
    .limit(30);

  // ───── Per-item candidate queries (run in parallel) ─────
  const receiptCandidatesByReceipt = new Map<
    string,
    {
      id: string;
      postedDate: string;
      amountCents: number;
      merchant: string | null;
      raw: string;
      accountName: string;
    }[]
  >();
  await Promise.all(
    unmatchedReceipts.map(async (r) => {
      if (!r.totalCents || !r.purchaseDate) {
        receiptCandidatesByReceipt.set(r.id, []);
        return;
      }
      const target = -r.totalCents;
      const lo = target - RECEIPT_AMOUNT_TOLERANCE_CENTS;
      const hi = target + RECEIPT_AMOUNT_TOLERANCE_CENTS;
      const dateLo = shiftDate(r.purchaseDate, -MATCH_DATE_WINDOW_DAYS);
      const dateHi = shiftDate(r.purchaseDate, +MATCH_DATE_WINDOW_DAYS);
      const cands = await db
        .select({
          id: transactions.id,
          postedDate: transactions.postedDate,
          amountCents: transactions.amountCents,
          merchant: transactions.normalizedMerchant,
          raw: transactions.rawDescription,
          accountName: bankAccounts.displayName,
        })
        .from(transactions)
        .innerJoin(
          bankAccounts,
          eq(bankAccounts.id, transactions.bankAccountId)
        )
        .where(
          and(
            eq(transactions.entityId, r.entityId),
            gte(transactions.amountCents, lo),
            lte(transactions.amountCents, hi),
            gte(transactions.postedDate, dateLo),
            lte(transactions.postedDate, dateHi),
            isNull(transactions.attachedReceiptId)
          )
        )
        .limit(4);
      receiptCandidatesByReceipt.set(r.id, cands);
    })
  );

  const manualCandidatesByEntry = new Map<
    string,
    {
      id: string;
      postedDate: string;
      amountCents: number;
      merchant: string | null;
      raw: string;
      accountName: string;
    }[]
  >();
  await Promise.all(
    unmatchedManual.map(async (m) => {
      const dateLo = shiftDate(m.date, -MATCH_DATE_WINDOW_DAYS);
      const dateHi = shiftDate(m.date, +MATCH_DATE_WINDOW_DAYS);
      const cands = await db
        .select({
          id: transactions.id,
          postedDate: transactions.postedDate,
          amountCents: transactions.amountCents,
          merchant: transactions.normalizedMerchant,
          raw: transactions.rawDescription,
          accountName: bankAccounts.displayName,
        })
        .from(transactions)
        .innerJoin(
          bankAccounts,
          eq(bankAccounts.id, transactions.bankAccountId)
        )
        .where(
          and(
            eq(transactions.entityId, m.entityId),
            eq(transactions.amountCents, m.amountCents),
            gte(transactions.postedDate, dateLo),
            lte(transactions.postedDate, dateHi),
            sql`NOT EXISTS (
              SELECT 1 FROM manual_entries me2
              WHERE me2.matched_transaction_id = transactions.id
            )`
          )
        )
        .limit(4);
      manualCandidatesByEntry.set(m.id, cands);
    })
  );

  // ───── Transfer candidate pair count (just the headline number) ─────
  const transferPairs = await db.execute<{ c: number }>(sql`
    WITH unconfirmed AS (
      SELECT t.* FROM transactions t WHERE t.is_inter_entity_transfer = false
    )
    SELECT COUNT(*)::int as c
    FROM unconfirmed a
    JOIN unconfirmed b ON
      a.entity_id <> b.entity_id
      AND a.amount_cents = -b.amount_cents
      AND ABS(b.posted_date - a.posted_date) <= 5
      AND a.amount_cents < 0
      AND b.amount_cents > 0
    ${
      scope.entity
        ? sql`WHERE a.entity_id = ${scope.entity.id} OR b.entity_id = ${scope.entity.id}`
        : sql``
    }
  `);
  const transferPairCount: number = (Array.isArray(transferPairs)
    ? (transferPairs as unknown as { c: number }[])
    : ((transferPairs as unknown as { rows: { c: number }[] }).rows ?? []))[0]?.c ?? 0;

  return (
    <Page>
      <PageHeader
        title="Reconcile"
        subtitle="Inbox-to-zero for receipts, manual entries, and inter-entity transfer pairs. Resolve each item to keep the ledger clean."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile
          label="Unmatched receipts"
          value={unmatchedReceipts.length.toLocaleString()}
          tone={unmatchedReceipts.length > 0 ? "warning" : "success"}
        />
        <StatTile
          label="Manual entries pending"
          value={unmatchedManual.length.toLocaleString()}
          tone={unmatchedManual.length > 0 ? "warning" : "success"}
        />
        <StatTile
          label="Transfer pairs to confirm"
          value={transferPairCount.toLocaleString()}
          tone={transferPairCount > 0 ? "warning" : "success"}
          hint={
            transferPairCount > 0 ? (
              <Link
                href="/transfers"
                className="hover:underline text-[var(--accent)]"
              >
                Resolve on /transfers →
              </Link>
            ) : (
              "All matched"
            )
          }
        />
      </div>

      {/* Receipts panel */}
      <section>
        <SectionHeader
          title="Receipts awaiting a transaction"
          hint={
            unmatchedReceipts.length > 0 ? (
              <Link
                href="/receipts"
                className="hover:underline text-[var(--accent)]"
              >
                All receipts →
              </Link>
            ) : undefined
          }
        />
        {unmatchedReceipts.length === 0 ? (
          <EmptyState
            title="Receipts inbox is clear"
            description="Drop a receipt under /receipts (or via the watcher) and any awaiting matches will surface here."
          />
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {unmatchedReceipts.map((r) => (
              <ReceiptCandidateCard
                key={r.id}
                receipt={r}
                candidates={receiptCandidatesByReceipt.get(r.id) ?? []}
              />
            ))}
          </div>
        )}
      </section>

      {/* Manual entries panel */}
      <section>
        <SectionHeader
          title="Manual entries awaiting an import"
          hint={
            unmatchedManual.length > 0 ? (
              <Link
                href="/quick-entry"
                className="hover:underline text-[var(--accent)]"
              >
                Quick entry →
              </Link>
            ) : undefined
          }
        />
        {unmatchedManual.length === 0 ? (
          <EmptyState
            title="Manual-entry inbox is clear"
            description="Heather's phone entries either auto-matched or will appear here when the next statement lands."
          />
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {unmatchedManual.map((m) => (
              <ManualCandidateCard
                key={m.id}
                entry={m}
                candidates={manualCandidatesByEntry.get(m.id) ?? []}
              />
            ))}
          </div>
        )}
      </section>

      {/* Transfer panel (link out to /transfers since action lives there) */}
      {transferPairCount > 0 && (
        <section>
          <SectionHeader title="Inter-entity transfer pairs" />
          <div className="rounded-xl border border-[var(--border)] bg-white p-5 shadow-[0_4px_12px_rgba(15,23,42,0.04)] flex items-center justify-between gap-4">
            <div className="text-sm">
              <StatusPill tone="warning">{transferPairCount} pairs</StatusPill>{" "}
              equal-but-opposite cross-entity amounts within ±5 days. Pick the
              purpose (rent / cleaning / loan / reimbursement) and confirm on
              the transfers page.
            </div>
            <Link
              href="/transfers"
              className="inline-flex items-center gap-2 rounded-full bg-[var(--foreground)] px-4 py-2 text-sm font-semibold text-white hover:-translate-y-0.5 transition-all duration-200 hover:shadow-[0_8px_24px_rgba(15,23,42,0.20)]"
            >
              Open transfers →
            </Link>
          </div>
        </section>
      )}
    </Page>
  );
}
