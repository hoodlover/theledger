import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import {
  contractors,
  transactions,
  entities,
  bankAccounts,
} from "@/lib/db/schema";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import {
  Page,
  PageHeader,
  Card,
  StatTile,
  Money,
  StatusPill,
  Avatar,
  EmptyState,
  SectionHeader,
} from "@/components/ui";
import { ContractorEditForm, W9Uploader, CounselorEarnings } from "./_client";

export const dynamic = "force-dynamic";

const THRESHOLD_CENTS = 60_000;

export default async function ContractorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const year = new Date().getFullYear();
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;

  const row = (
    await db
      .select({
        contractor: contractors,
        entityName: entities.name,
        entitySlug: entities.slug,
      })
      .from(contractors)
      .innerJoin(entities, eq(entities.id, contractors.entityId))
      .where(eq(contractors.id, id))
  )[0];
  if (!row) notFound();
  const { contractor: c, entityName, entitySlug } = row;

  const [stats] = await db
    .select({
      count: sql<number>`coalesce(count(*), 0)::int`,
      paidCents: sql<number>`coalesce(sum(case when ${transactions.amountCents} < 0 then -${transactions.amountCents} else 0 end), 0)::int`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.contractorId, id),
        gte(transactions.postedDate, yearStart),
        lte(transactions.postedDate, yearEnd)
      )
    );

  // All YTD payments (debits only — what we paid the counselor).
  // Used by both the "Recent payments" list and the earnings calculator.
  const ytdPayments = await db
    .select({
      id: transactions.id,
      postedDate: transactions.postedDate,
      amountCents: transactions.amountCents,
      merchant: transactions.normalizedMerchant,
      raw: transactions.rawDescription,
      accountName: bankAccounts.displayName,
    })
    .from(transactions)
    .innerJoin(bankAccounts, eq(bankAccounts.id, transactions.bankAccountId))
    .where(
      and(
        eq(transactions.contractorId, id),
        gte(transactions.postedDate, yearStart),
        lte(transactions.postedDate, yearEnd),
        sql`${transactions.amountCents} < 0`
      )
    )
    .orderBy(desc(transactions.postedDate));

  const recent = ytdPayments.slice(0, 20);

  const w9OnFile = c.w9OnFile || !!c.w9DocUrl;
  const overThreshold = stats.paidCents >= THRESHOLD_CENTS;
  const w9Needed = overThreshold && !w9OnFile;
  const display = c.dba ?? c.legalName;

  return (
    <Page>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <Avatar src={c.avatarUrl} name={display} size={64} />
          <div>
            <h1 className="font-display text-3xl tracking-tight">{display}</h1>
            <p className="mt-1 text-sm text-[var(--muted)]">
              1099-NEC contractor at{" "}
              <Link
                href={`/entities/${entitySlug}`}
                className="hover:underline"
              >
                {entityName}
              </Link>
              {c.role ? ` · ${c.role}` : ""}
            </p>
            {c.dba && c.dba !== c.legalName && (
              <p className="mt-0.5 text-xs text-[var(--muted)]">
                IRS recipient: <span className="font-medium">{c.legalName}</span>
              </p>
            )}
          </div>
        </div>
        <Link
          href="/contractors"
          className="rounded-full border border-[var(--border)] px-4 py-1.5 text-sm text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface-warm)] transition-colors"
        >
          &larr; All contractors
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile label="Payments" value={stats.count.toLocaleString()} />
        <StatTile
          label={`YTD ${year}`}
          value={<Money cents={stats.paidCents} />}
        />
        <StatTile
          label="W-9 status"
          value={w9OnFile ? "On file" : "Missing"}
          tone={w9OnFile ? "success" : overThreshold ? "danger" : "warning"}
          hint={
            w9Needed
              ? `Over $${(THRESHOLD_CENTS / 100).toLocaleString()} threshold`
              : c.w9OnFile && !c.w9DocUrl
                ? "Marked on file — no PDF uploaded"
                : undefined
          }
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* Left: edit + payments */}
        <div className="space-y-6">
          <section>
            <SectionHeader title="Contractor details" />
            <Card className="p-5">
              <ContractorEditForm
                id={c.id}
                initial={{
                  legalName: c.legalName,
                  dba: c.dba,
                  role: c.role,
                  address: c.address,
                  einOrSsn: c.einOrSsnEncrypted,
                  startedDate: c.startedDate,
                  endedDate: c.endedDate,
                  feeKeepPercent: c.feeKeepPercent,
                }}
              />
            </Card>
          </section>

          <section>
            <SectionHeader
              title="Counselor earnings"
              hint={
                <span className="text-xs text-[var(--muted)]">
                  Set fee % above to compute splits
                </span>
              }
            />
            <CounselorEarnings
              payments={ytdPayments.map((p) => ({
                id: p.id,
                postedDate: p.postedDate,
                amountCents: p.amountCents,
              }))}
              feeKeepPercent={c.feeKeepPercent}
              year={year}
            />
          </section>

          <section>
            <SectionHeader
              title="Recent payments"
              hint={
                <Link
                  href={`/transactions?q=${encodeURIComponent(c.legalName)}`}
                  className="text-[var(--accent)] hover:underline"
                >
                  All payments →
                </Link>
              }
            />
            {recent.length === 0 ? (
              <EmptyState
                title="No payments tagged yet"
                description="Tag transactions to this contractor from the /transactions drawer."
              />
            ) : (
              <Card>
                <ul className="divide-y divide-[var(--border)] text-sm">
                  {recent.map((t) => (
                    <li key={t.id} className="px-5 py-3">
                      <Link
                        href={`/transactions?txn=${t.id}`}
                        className="flex items-baseline justify-between gap-3 hover:underline"
                      >
                        <span className="tabular text-xs text-[var(--muted)] w-20 shrink-0">
                          {t.postedDate}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">
                            {t.merchant ?? "—"}
                          </div>
                          <div className="text-xs text-[var(--muted)] truncate">
                            {t.accountName}
                          </div>
                        </div>
                        <span className="font-semibold tabular whitespace-nowrap">
                          <Money cents={t.amountCents} signed />
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </section>
        </div>

        {/* Right: W-9 + status */}
        <aside className="space-y-6 lg:sticky lg:top-24 h-fit">
          <section>
            <SectionHeader title="W-9 on file" />
            <Card className="p-5">
              <W9Uploader id={c.id} current={c.w9DocUrl} onFile={c.w9OnFile} />
            </Card>
          </section>

          {w9Needed && (
            <div className="rounded-xl border border-[#ebcacb] bg-[#f5e8e9] p-4 text-sm text-[var(--danger)]">
              <div className="font-semibold mb-1">
                W-9 required for 1099 filing
              </div>
              Paid <Money cents={stats.paidCents} /> in {year} — over the
              $600 IRS threshold. Get the W-9 before January 31, {year + 1}.
            </div>
          )}

          {(c.einOrSsnEncrypted || c.address) && (
            <section>
              <SectionHeader title="Recipient info" />
              <Card className="p-5 text-sm space-y-3">
                {c.einOrSsnEncrypted && (
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                      TIN
                    </div>
                    <div className="font-medium tabular mt-0.5">
                      {c.einOrSsnEncrypted}
                    </div>
                  </div>
                )}
                {c.address && (
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                      Address
                    </div>
                    <div className="mt-0.5">{c.address}</div>
                  </div>
                )}
                {c.startedDate && (
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                      Started
                    </div>
                    <div className="font-medium tabular mt-0.5">
                      {c.startedDate}
                    </div>
                  </div>
                )}
                {c.endedDate && (
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                      Ended
                    </div>
                    <div className="font-medium tabular mt-0.5">
                      {c.endedDate}
                    </div>
                  </div>
                )}
              </Card>
            </section>
          )}
        </aside>
      </div>
    </Page>
  );
}
