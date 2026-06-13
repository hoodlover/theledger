import Link from "next/link";
import {
  Page,
  PageHeader,
  Card,
  StatusPill,
  Callout,
} from "@/components/ui";
import { db } from "@/lib/db";
import { entities, bankAccounts, creditCardHolders } from "@/lib/db/schema";
import { getActiveScope } from "@/lib/scope";
import { eq, asc } from "drizzle-orm";

export const dynamic = "force-dynamic";

const KIND_LABEL: Record<string, string> = {
  checking: "Checking",
  savings: "Savings",
  credit_card: "Credit card",
  loc: "Line of credit",
};

export default async function AccountsPage() {
  const scope = await getActiveScope();
  const where = scope.entity ? eq(bankAccounts.entityId, scope.entity.id) : undefined;

  const accounts = await db
    .select({
      account: bankAccounts,
      entityName: entities.name,
      entitySlug: entities.slug,
    })
    .from(bankAccounts)
    .innerJoin(entities, eq(entities.id, bankAccounts.entityId))
    .where(where!)
    .orderBy(asc(bankAccounts.institution), asc(bankAccounts.displayName));

  const holders = await db.select().from(creditCardHolders);
  const holdersByAccount = new Map<string, typeof holders>();
  for (const h of holders) {
    const list = holdersByAccount.get(h.bankAccountId) ?? [];
    list.push(h);
    holdersByAccount.set(h.bankAccountId, list);
  }

  const byInstitution = new Map<string, typeof accounts>();
  for (const row of accounts) {
    const list = byInstitution.get(row.account.institution) ?? [];
    list.push(row);
    byInstitution.set(row.account.institution, list);
  }

  return (
    <Page>
      <PageHeader
        title="Bank accounts &amp; cards"
        subtitle={`${accounts.length} account${accounts.length === 1 ? "" : "s"} across ${byInstitution.size} institution${byInstitution.size === 1 ? "" : "s"}.`}
      />

      <div className="space-y-8">
        {[...byInstitution.entries()].map(([institution, rows]) => (
          <section key={institution}>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
              {institution}
            </h2>
            <Card>
              <ul className="divide-y divide-[var(--border)]">
                {rows.map(({ account, entityName }) => {
                  const cardHolders = holdersByAccount.get(account.id) ?? [];
                  return (
                    <li key={account.id} className="hover:bg-[var(--surface)]">
                      <Link href={`/accounts/${account.id}`} className="block px-4 py-3">
                      <div className="flex items-baseline justify-between gap-4">
                        <div className="font-medium">{account.displayName}</div>
                        <div className="text-xs text-[var(--muted)]">
                          {KIND_LABEL[account.kind] ?? account.kind}
                          {" · "}
                          {account.last4 === "TBD"
                            ? "last4 TBD"
                            : `••${account.last4}`}
                        </div>
                      </div>
                      <div className="mt-1 text-sm text-[var(--muted)]">
                        {entityName}
                      </div>
                      {account.routingRules && (
                        <div className="mt-1 text-xs text-[var(--muted)]">
                          {account.routingRules}
                        </div>
                      )}
                      {account.kind === "credit_card" && (
                        <div className="mt-2">
                          {cardHolders.length === 0 ? (
                            <StatusPill tone="warning">
                              No cardholder on file
                            </StatusPill>
                          ) : (
                            <StatusPill tone="neutral">
                              {cardHolders
                                .map(
                                  (h) =>
                                    `${h.personName}${h.personRole ? ` (${h.personRole})` : ""}`
                                )
                                .join(", ")}
                            </StatusPill>
                          )}
                        </div>
                      )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </Card>
          </section>
        ))}
      </div>

      <div className="mt-10">
        <Callout title="Still TBD" tone="warning">
          <ul className="mt-1 list-disc space-y-1 pl-5">
            <li>2 more Bluevine sub-accounts (5 named, 7 referenced)</li>
            <li>Last-4 digits for BofA checking, savings, and 3 credit cards</li>
            <li>Names of the 3 BofA cardholders</li>
            <li>Whether &ldquo;3 cards for 2 buildings&rdquo; implies a second building beyond PTC Havens</li>
          </ul>
        </Callout>
      </div>
    </Page>
  );
}
