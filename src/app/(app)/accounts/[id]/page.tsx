import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import {
  bankAccounts,
  entities,
  creditCardHolders,
  transactions,
} from "@/lib/db/schema";
import { eq, sql, desc } from "drizzle-orm";
import {
  Page,
  PageHeader,
  Card,
  StatTile,
  Money,
  EmptyState,
  StatusPill,
} from "@/components/ui";
import { AccountEditForm, CardHolderList } from "./_client";

export const dynamic = "force-dynamic";

export default async function AccountDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const row = (
    await db
      .select({
        account: bankAccounts,
        entityName: entities.name,
        entitySlug: entities.slug,
      })
      .from(bankAccounts)
      .innerJoin(entities, eq(entities.id, bankAccounts.entityId))
      .where(eq(bankAccounts.id, id))
  )[0];
  if (!row) notFound();
  const { account, entityName } = row;

  const [{ count: txnCount, total: ytdNet, debits, credits }] = await db
    .select({
      count: sql<number>`coalesce(count(*), 0)::int`,
      total: sql<number>`coalesce(sum(${transactions.amountCents}), 0)::int`,
      debits: sql<number>`coalesce(sum(case when ${transactions.amountCents} < 0 then ${transactions.amountCents} else 0 end), 0)::int`,
      credits: sql<number>`coalesce(sum(case when ${transactions.amountCents} > 0 then ${transactions.amountCents} else 0 end), 0)::int`,
    })
    .from(transactions)
    .where(eq(transactions.bankAccountId, id));

  const holders = await db
    .select()
    .from(creditCardHolders)
    .where(eq(creditCardHolders.bankAccountId, id))
    .orderBy(desc(creditCardHolders.started));

  const recent = await db
    .select({
      id: transactions.id,
      postedDate: transactions.postedDate,
      amountCents: transactions.amountCents,
      normalizedMerchant: transactions.normalizedMerchant,
    })
    .from(transactions)
    .where(eq(transactions.bankAccountId, id))
    .orderBy(desc(transactions.postedDate))
    .limit(10);

  return (
    <Page>
      <PageHeader
        title={account.displayName}
        subtitle={
          <>
            {account.institution} · {account.kind} ·{" "}
            {account.last4 === "TBD" ? (
              <StatusPill tone="warning">last4 TBD</StatusPill>
            ) : (
              <span className="tabular">••{account.last4}</span>
            )}{" "}
            · {entityName}
          </>
        }
        actions={
          <Link
            href="/accounts"
            className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--muted)] hover:text-[var(--foreground)]"
          >
            &larr; Accounts
          </Link>
        }
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-4">
        <StatTile label="Transactions" value={txnCount.toLocaleString()} />
        <StatTile label="Inflow" value={<Money cents={credits} />} tone="success" />
        <StatTile label="Outflow" value={<Money cents={debits} />} tone="danger" />
        <StatTile label="Net" value={<Money cents={ytdNet} signed />} tone={ytdNet >= 0 ? "success" : "danger"} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
            Edit
          </h2>
          <Card className="p-4">
            <AccountEditForm
              id={account.id}
              initial={{
                displayName: account.displayName,
                institution: account.institution,
                kind: account.kind,
                last4: account.last4,
                routingRules: account.routingRules,
              }}
              txnCount={txnCount}
            />
          </Card>

          {account.kind === "credit_card" && (
            <div className="mt-6">
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
                Cardholders
              </h2>
              <Card className="p-4">
                <CardHolderList
                  bankAccountId={account.id}
                  holders={holders.map((h) => ({
                    id: h.id,
                    personName: h.personName,
                    personRole: h.personRole,
                    started: h.started,
                    ended: h.ended,
                  }))}
                />
              </Card>
            </div>
          )}
        </div>

        <div>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
            Recent transactions
          </h2>
          {recent.length === 0 ? (
            <EmptyState
              title="No transactions"
              description="Drop a statement or run the backfill to populate."
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
                  </li>
                ))}
              </ul>
              <div className="border-t border-[var(--border)] px-4 py-2 text-xs text-[var(--muted)]">
                <Link
                  href={`/transactions?account=${account.id}`}
                  className="hover:underline"
                >
                  See all {txnCount.toLocaleString()} transactions →
                </Link>
              </div>
            </Card>
          )}
        </div>
      </div>
    </Page>
  );
}
