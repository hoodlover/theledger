import Link from "next/link";
import { db } from "@/lib/db";
import { manualEntries, entities, transactions, users } from "@/lib/db/schema";
import { eq, desc, sql, asc, isNull } from "drizzle-orm";
import { getActiveScope } from "@/lib/scope";
import {
  Page,
  PageHeader,
  Card,
  StatTile,
  Money,
  StatusPill,
  EmptyState,
} from "@/components/ui";
import { QuickEntryForm } from "./_form";

export const dynamic = "force-dynamic";

export default async function QuickEntryPage() {
  const scope = await getActiveScope();
  const todayISO = new Date().toISOString().slice(0, 10);

  const entityList = await db
    .select({ id: entities.id, name: entities.name })
    .from(entities)
    .orderBy(asc(entities.name));

  const defaultEntityId = scope.entity?.id ?? entityList[0]?.id ?? "";

  const recent = await db
    .select({
      id: manualEntries.id,
      date: manualEntries.date,
      amountCents: manualEntries.amountCents,
      payeeText: manualEntries.payeeText,
      notes: manualEntries.notes,
      matchedTransactionId: manualEntries.matchedTransactionId,
      entityName: entities.name,
      enteredBy: users.name,
      createdAt: manualEntries.createdAt,
    })
    .from(manualEntries)
    .innerJoin(entities, eq(entities.id, manualEntries.entityId))
    .innerJoin(users, eq(users.id, manualEntries.enteredByUserId))
    .orderBy(desc(manualEntries.createdAt))
    .limit(25);

  const [stats] = await db
    .select({
      total: sql<number>`coalesce(count(*), 0)::int`,
      matched: sql<number>`coalesce(sum(case when ${manualEntries.matchedTransactionId} is not null then 1 else 0 end), 0)::int`,
    })
    .from(manualEntries);

  const unmatched = stats.total - stats.matched;

  return (
    <Page>
      <PageHeader
        title="Quick entry"
        subtitle="Heather drops these from her phone. Auto-matches to the next imported statement on exact amount + date ±5 days."
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <StatTile label="Total entries" value={stats.total.toLocaleString()} />
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
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
            New entry
          </h2>
          <Card className="p-4">
            <QuickEntryForm
              entities={entityList}
              defaultEntityId={defaultEntityId}
              todayISO={todayISO}
            />
          </Card>
        </div>

        <div>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
            Recent entries
          </h2>
          {recent.length === 0 ? (
            <EmptyState
              title="No manual entries yet"
              description="Save your first one in the form on the left."
            />
          ) : (
            <Card>
              <ul className="divide-y divide-[var(--border)]">
                {recent.map((m) => (
                  <li key={m.id} className="px-4 py-3 text-sm">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="tabular text-[var(--muted)]">
                        {m.date}
                      </span>
                      <span className="font-medium">
                        {m.payeeText ?? "(no payee)"}
                      </span>
                      <span className="tabular">
                        <Money cents={m.amountCents} signed />
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
                      <span>{m.entityName}</span>
                      <span>·</span>
                      <span>by {m.enteredBy}</span>
                      {m.matchedTransactionId ? (
                        <Link
                          href={`/transactions?txn=${m.matchedTransactionId}`}
                          className="hover:underline"
                        >
                          <StatusPill tone="success">Matched</StatusPill>
                        </Link>
                      ) : (
                        <StatusPill tone="warning">Awaiting match</StatusPill>
                      )}
                    </div>
                    {m.notes && (
                      <div className="mt-1 text-xs text-[var(--muted)]">
                        {m.notes}
                      </div>
                    )}
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
