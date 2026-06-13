import {
  Page,
  PageHeader,
  Card,
  EmptyState,
  StatusPill,
  Callout,
} from "@/components/ui";
import { db } from "@/lib/db";
import {
  statementImports,
  entities,
  bankAccounts,
  transactions,
} from "@/lib/db/schema";
import { getActiveScope } from "@/lib/scope";
import { eq, desc, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function ImportsPage() {
  const scope = await getActiveScope();
  const where = scope.entity
    ? eq(statementImports.entityId, scope.entity.id)
    : undefined;

  const recent = await db
    .select({
      imp: statementImports,
      entityName: entities.name,
      accountDisplayName: bankAccounts.displayName,
      txnCount: sql<number>`count(${transactions.id})::int`,
    })
    .from(statementImports)
    .innerJoin(entities, eq(entities.id, statementImports.entityId))
    .innerJoin(bankAccounts, eq(bankAccounts.id, statementImports.bankAccountId))
    .leftJoin(
      transactions,
      eq(transactions.statementImportId, statementImports.id)
    )
    .where(where!)
    .groupBy(statementImports.id, entities.name, bankAccounts.displayName)
    .orderBy(desc(statementImports.importedAt))
    .limit(50);

  return (
    <Page>
      <PageHeader
        title="Statement imports"
        subtitle="Drop folder watcher + Claude classifier route statements to the right entity. Magic-byte sniff catches extension-less Bluevine PDFs."
      />

      {recent.length === 0 ? (
        <EmptyState
          title="No imports yet"
          description={
            <>
              Next chunk: share cobbvault&rsquo;s Vercel Blob storage so historical
              statements backfill automatically. Until then, run
              <code className="mx-1 rounded bg-[var(--surface)] px-1 py-0.5 text-xs">
                npm run watch:drop
              </code>
              and drop a PDF in DROP_FOLDER_PATH.
            </>
          }
        />
      ) : (
        <Card>
          <ul className="divide-y divide-[var(--border)]">
            {recent.map((row) => (
              <li key={row.imp.id} className="px-4 py-3">
                <div className="flex items-baseline justify-between gap-4">
                  <div className="font-medium">{row.imp.sourceFilename}</div>
                  <StatusPill tone="neutral">
                    {row.txnCount} txn{row.txnCount === 1 ? "" : "s"}
                  </StatusPill>
                </div>
                <div className="mt-1 text-sm text-[var(--muted)]">
                  {row.entityName} · {row.accountDisplayName}
                </div>
                <div className="mt-1 text-xs text-[var(--muted)]">
                  {row.imp.periodStart && row.imp.periodEnd
                    ? `${row.imp.periodStart} → ${row.imp.periodEnd}`
                    : "no period detected"}
                  {" · "}
                  imported {new Date(row.imp.importedAt).toLocaleString()}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="mt-10">
        <Callout title="v0 watcher behavior">
          <ul className="mt-1 list-disc space-y-1 pl-5">
            <li>Magic-byte sniff: PDF, JPEG, PNG</li>
            <li>
              Claude classifier returns{" "}
              <code className="text-xs">
                {`{ document_type, institution, entity_guess, last4, period, transactions[], confidence }`}
              </code>
            </li>
            <li>Non-statement docs → REVIEW/ (v0 handles statements only)</li>
            <li>Confidence &lt; 0.7 → REVIEW/</li>
            <li>Ingested → Imported/&lt;year&gt;/&lt;entity-slug&gt;/</li>
          </ul>
        </Callout>
      </div>
    </Page>
  );
}
