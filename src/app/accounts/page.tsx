import Link from "next/link";
import { db } from "@/lib/db";
import { entities, bankAccounts, creditCardHolders } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";

export const dynamic = "force-dynamic";

const KIND_LABEL: Record<string, string> = {
  checking: "Checking",
  savings: "Savings",
  credit_card: "Credit card",
  loc: "Line of credit",
};

export default async function AccountsPage() {
  const accounts = await db
    .select({
      account: bankAccounts,
      entityName: entities.name,
      entitySlug: entities.slug,
    })
    .from(bankAccounts)
    .innerJoin(entities, eq(entities.id, bankAccounts.entityId))
    .orderBy(asc(bankAccounts.institution), asc(bankAccounts.displayName));

  const holders = await db.select().from(creditCardHolders);
  const holdersByAccount = new Map<string, typeof holders>();
  for (const h of holders) {
    const list = holdersByAccount.get(h.bankAccountId) ?? [];
    list.push(h);
    holdersByAccount.set(h.bankAccountId, list);
  }

  // group by institution
  const byInstitution = new Map<string, typeof accounts>();
  for (const row of accounts) {
    const list = byInstitution.get(row.account.institution) ?? [];
    list.push(row);
    byInstitution.set(row.account.institution, list);
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-12 font-sans">
      <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-900">
        &larr; Home
      </Link>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">
        Bank accounts &amp; cards
      </h1>
      <p className="mt-2 text-zinc-600">
        {accounts.length} account{accounts.length === 1 ? "" : "s"} across{" "}
        {byInstitution.size} institution{byInstitution.size === 1 ? "" : "s"}.
      </p>

      <div className="mt-8 space-y-8">
        {[...byInstitution.entries()].map(([institution, rows]) => (
          <section key={institution}>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
              {institution}
            </h2>
            <ul className="mt-2 divide-y divide-zinc-200 rounded-lg border border-zinc-200">
              {rows.map(({ account, entityName }) => {
                const cardHolders = holdersByAccount.get(account.id) ?? [];
                return (
                  <li key={account.id} className="px-4 py-3">
                    <div className="flex items-baseline justify-between gap-4">
                      <div className="font-medium">{account.displayName}</div>
                      <div className="text-xs uppercase tracking-wide text-zinc-500">
                        {KIND_LABEL[account.kind] ?? account.kind}
                        {" · "}
                        {account.last4 === "TBD" ? "last4 TBD" : `••${account.last4}`}
                      </div>
                    </div>
                    <div className="mt-1 text-sm text-zinc-600">{entityName}</div>
                    {account.routingRules && (
                      <div className="mt-1 text-xs text-zinc-500">
                        {account.routingRules}
                      </div>
                    )}
                    {account.kind === "credit_card" && (
                      <div className="mt-2 text-xs">
                        {cardHolders.length === 0 ? (
                          <span className="text-amber-700">
                            No cardholder on file
                          </span>
                        ) : (
                          <span className="text-zinc-600">
                            Cardholder:{" "}
                            {cardHolders
                              .map(
                                (h) =>
                                  `${h.personName}${h.personRole ? ` (${h.personRole})` : ""}`
                              )
                              .join(", ")}
                          </span>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      <div className="mt-10 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <div className="font-medium">Still TBD</div>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>2 more Bluevine sub-accounts (5 named, 7 referenced in prior context)</li>
          <li>Last-4 digits for BofA Path to Change checking, savings, and 3 credit cards</li>
          <li>Names of the 3 BofA cardholders</li>
          <li>Whether "3 cards for 2 buildings" implies a second building beyond PTC Havens</li>
        </ul>
      </div>
    </main>
  );
}
