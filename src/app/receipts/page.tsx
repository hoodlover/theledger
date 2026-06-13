import Link from "next/link";
import { db } from "@/lib/db";
import { receipts, entities, transactions } from "@/lib/db/schema";
import { eq, desc, sql, asc } from "drizzle-orm";
import { getActiveScope } from "@/lib/scope";
import {
  Page,
  PageHeader,
  Card,
  StatTile,
  Money,
  StatusPill,
  EmptyState,
  Callout,
} from "@/components/ui";
import { ReceiptUploadForm } from "./_upload-form";

export const dynamic = "force-dynamic";

export default async function ReceiptsPage() {
  const scope = await getActiveScope();
  const where = scope.entity ? eq(receipts.entityId, scope.entity.id) : undefined;

  const entityOpts = await db
    .select({ id: entities.id, name: entities.name })
    .from(entities)
    .orderBy(asc(entities.name));
  const defaultEntityId =
    scope.entity?.id ?? entityOpts[0]?.id ?? "";

  const recent = await db
    .select({
      receipt: receipts,
      entityName: entities.name,
      matchedDate: transactions.postedDate,
      matchedMerchant: transactions.normalizedMerchant,
    })
    .from(receipts)
    .innerJoin(entities, eq(entities.id, receipts.entityId))
    .leftJoin(transactions, eq(transactions.id, receipts.matchedTransactionId))
    .where(where!)
    .orderBy(desc(receipts.createdAt))
    .limit(40);

  const [stats] = await db
    .select({
      total: sql<number>`coalesce(count(*), 0)::int`,
      matched: sql<number>`coalesce(sum(case when ${receipts.matchedTransactionId} is not null then 1 else 0 end), 0)::int`,
      crossEntity: sql<number>`coalesce(
        sum(case when ${receipts.matchedTransactionId} is not null
                 AND EXISTS (
                   SELECT 1 FROM ${transactions} t
                    WHERE t.id = ${receipts.matchedTransactionId}
                      AND t.entity_id <> ${receipts.entityId}
                 )
            then 1 else 0 end), 0)::int`,
    })
    .from(receipts);
  const unmatched = stats.total - stats.matched;

  return (
    <Page>
      <PageHeader
        title="Receipts"
        subtitle="Phone upload + Claude classifier + auto-match. Drops also land here via the watcher."
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-4">
        <StatTile label="Total" value={stats.total.toLocaleString()} />
        <StatTile
          label="Auto-matched"
          value={stats.matched.toLocaleString()}
          tone="success"
        />
        <StatTile
          label="Awaiting match"
          value={unmatched.toLocaleString()}
          tone={unmatched > 0 ? "warning" : "neutral"}
        />
        <StatTile
          label="Cross-entity"
          value={stats.crossEntity.toLocaleString()}
          tone={stats.crossEntity > 0 ? "warning" : "neutral"}
          hint="filed under wrong entity"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
            Upload
          </h2>
          <Card className="p-4">
            <ReceiptUploadForm
              entities={entityOpts}
              defaultEntityId={defaultEntityId}
            />
          </Card>
        </div>

        <div>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
            Recent
          </h2>
          {recent.length === 0 ? (
            <EmptyState
              title="No receipts yet"
              description="Upload a photo on the left, or run the drop-folder watcher to ingest from disk."
            />
          ) : (
            <Card>
              <ul className="divide-y divide-[var(--border)] text-sm">
                {recent.map((r) => (
                  <li key={r.receipt.id} className="px-4 py-3">
                    <div className="flex items-baseline justify-between gap-3">
                      <div>
                        <a
                          href={r.receipt.blobUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium hover:underline"
                        >
                          {r.receipt.merchant ?? "(unknown merchant)"}
                        </a>
                        <div className="text-xs text-[var(--muted)]">
                          {r.entityName} ·{" "}
                          {r.receipt.purchaseDate ?? "no date"} ·{" "}
                          {r.receipt.source}
                        </div>
                      </div>
                      <div className="text-right">
                        <Money cents={r.receipt.totalCents} />
                        <div className="mt-1">
                          {r.receipt.matchedTransactionId ? (
                            <Link
                              href={`/transactions?txn=${r.receipt.matchedTransactionId}`}
                              className="hover:underline"
                            >
                              <StatusPill tone="success">Matched</StatusPill>
                            </Link>
                          ) : (
                            <StatusPill tone="warning">Awaiting</StatusPill>
                          )}
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>

      <div className="mt-10">
        <Callout title="v0 watcher behavior">
          <ul className="mt-1 list-disc space-y-1 pl-5">
            <li>Magic-byte sniff: PDF, JPEG, PNG, WEBP, HEIC</li>
            <li>
              Claude extracts merchant / purchase_date / total / tax / tip
            </li>
            <li>Auto-match: same entity + amount ±$0.50 + date ±5 days</li>
            <li>Cross-entity match is flagged (wrong card / wrong folder / wrong tag)</li>
            <li>has_receipt column populated in /export transactions CSV</li>
          </ul>
        </Callout>
      </div>
    </Page>
  );
}
