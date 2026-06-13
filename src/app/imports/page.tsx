import Link from "next/link";
import { db } from "@/lib/db";
import {
  statementImports,
  entities,
  bankAccounts,
  transactions,
} from "@/lib/db/schema";
import { eq, desc, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function ImportsPage() {
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
    .groupBy(statementImports.id, entities.name, bankAccounts.displayName)
    .orderBy(desc(statementImports.importedAt))
    .limit(50);

  return (
    <main className="mx-auto max-w-4xl px-6 py-12 font-sans">
      <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-900">
        &larr; Home
      </Link>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">
        Statement imports
      </h1>
      <p className="mt-2 text-zinc-600">
        Drop statements into{" "}
        <code className="rounded bg-zinc-100 px-1 py-0.5 text-sm">
          DROP_FOLDER_PATH
        </code>{" "}
        and run{" "}
        <code className="rounded bg-zinc-100 px-1 py-0.5 text-sm">
          npm run watch:drop
        </code>
        . PDFs without an extension are caught by magic-byte sniff (the
        cobbvault bug that does NOT get repeated here).
      </p>

      {recent.length === 0 ? (
        <div className="mt-8 rounded-lg border border-dashed border-zinc-300 p-8 text-center text-zinc-500">
          No imports yet. Start the watcher and drop a statement.
        </div>
      ) : (
        <ul className="mt-8 divide-y divide-zinc-200 rounded-lg border border-zinc-200">
          {recent.map((row) => (
            <li key={row.imp.id} className="px-4 py-3">
              <div className="flex items-baseline justify-between gap-4">
                <div className="font-medium">{row.imp.sourceFilename}</div>
                <div className="text-xs uppercase tracking-wide text-zinc-500">
                  {row.txnCount} txn{row.txnCount === 1 ? "" : "s"}
                </div>
              </div>
              <div className="mt-1 text-sm text-zinc-600">
                {row.entityName} · {row.accountDisplayName}
              </div>
              <div className="mt-1 text-xs text-zinc-500">
                {row.imp.periodStart && row.imp.periodEnd
                  ? `${row.imp.periodStart} → ${row.imp.periodEnd}`
                  : "no period detected"}
                {" · "}
                imported {new Date(row.imp.importedAt).toLocaleString()}
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-10 rounded-md border border-zinc-200 bg-zinc-50 p-4 text-sm">
        <div className="font-medium">v0 watcher behavior</div>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-zinc-700">
          <li>Magic-byte sniff: PDF, JPEG, PNG</li>
          <li>Claude classifier returns {`{ document_type, institution, entity_guess, last4, period, transactions[], confidence }`}</li>
          <li>Non-statement docs → REVIEW/ with sidecar (v0 handles statements only)</li>
          <li>Confidence &lt; 0.7 → REVIEW/</li>
          <li>Ingested → Imported/&lt;year&gt;/&lt;entity-slug&gt;/</li>
        </ul>
      </div>
    </main>
  );
}
