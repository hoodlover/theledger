import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import {
  entities,
  bankAccounts,
  transactions,
  contractors,
  employees,
  taxDeadlines,
  receipts,
  creditCardHolders,
  llcPaperwork,
} from "@/lib/db/schema";
import {
  and,
  eq,
  sql,
  desc,
  asc,
  ne,
  gte,
  lte,
} from "drizzle-orm";
import {
  Page,
  StatTile,
  Card,
  Money,
  StatusPill,
  SectionHeader,
  EmptyState,
  Avatar,
} from "@/components/ui";

export const dynamic = "force-dynamic";

const ENTITY_PHOTO: Record<string, string> = {
  "path-to-change": "/theledger-assets/entity-path-to-change.png",
  "ptc-havens": "/theledger-assets/entity-ptc-havens.png",
  "hl-place-of-grace": "/theledger-assets/entity-hl-place-of-grace.png",
  "hl-havens": "/theledger-assets/entity-hl-havens.png",
  cfs: "/theledger-assets/entity-cfs.png",
  "personal-joint": "/theledger-assets/emblem-wider.webp",
};

const KIND_LABEL: Record<string, string> = {
  s_corp: "S-Corporation",
  llc: "Limited Liability Co.",
  sole_prop: "Sole Proprietorship",
  individual: "Personal · Joint",
};

const ACCOUNT_KIND: Record<string, string> = {
  checking: "Checking",
  savings: "Savings",
  credit_card: "Credit card",
  loc: "Line of credit",
};

const DEADLINE_KIND: Record<string, string> = {
  "1120_s": "Form 1120-S",
  "1040": "Form 1040",
  quarterly_estimated: "Quarterly estimated",
  state_annual: "GA annual report",
  "1099_due": "1099-NEC",
  w2_due: "W-2",
  "941_quarterly": "Form 941",
  "940_annual": "Form 940",
  eftps_deposit: "EFTPS deposit",
  ga_g7_withholding: "GA G-7",
  ga_suta: "GA SUTA",
  futa_deposit: "FUTA deposit",
};

function daysUntil(due: string, today: Date): number {
  const dueD = new Date(due + "T00:00:00Z");
  return Math.round((dueD.getTime() - today.getTime()) / 86_400_000);
}

export default async function EntityDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const today = new Date();
  const todayISO = today.toISOString().slice(0, 10);
  const year = today.getFullYear();
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;

  const [entity] = await db.select().from(entities).where(eq(entities.slug, slug));
  if (!entity) notFound();

  const photo =
    ENTITY_PHOTO[entity.slug] ?? "/theledger-assets/emblem-wider.webp";
  const kindLabel = KIND_LABEL[entity.kind] ?? entity.kind;

  const [
    [stats],
    accountsRows,
    contractorRows,
    employeeRows,
    recentTxns,
    upcomingDeadlines,
    recentReceipts,
    paperworkRows,
    [{ value: cardHolderCount }],
  ] = await Promise.all([
    db
      .select({
        count: sql<number>`coalesce(count(*), 0)::int`,
        inflow: sql<number>`coalesce(sum(case when ${transactions.amountCents} > 0 then ${transactions.amountCents} else 0 end), 0)::int`,
        outflow: sql<number>`coalesce(sum(case when ${transactions.amountCents} < 0 then -${transactions.amountCents} else 0 end), 0)::int`,
        net: sql<number>`coalesce(sum(${transactions.amountCents}), 0)::int`,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.entityId, entity.id),
          gte(transactions.postedDate, yearStart),
          lte(transactions.postedDate, yearEnd)
        )
      ),
    db
      .select({
        id: bankAccounts.id,
        displayName: bankAccounts.displayName,
        institution: bankAccounts.institution,
        kind: bankAccounts.kind,
        last4: bankAccounts.last4,
      })
      .from(bankAccounts)
      .where(eq(bankAccounts.entityId, entity.id))
      .orderBy(asc(bankAccounts.institution), asc(bankAccounts.displayName)),
    db
      .select({
        id: contractors.id,
        legalName: contractors.legalName,
        dba: contractors.dba,
        role: contractors.role,
        avatarUrl: contractors.avatarUrl,
        paidCents: sql<number>`coalesce(sum(case when ${transactions.amountCents} < 0 then -${transactions.amountCents} else 0 end), 0)::int`,
      })
      .from(contractors)
      .leftJoin(
        transactions,
        and(
          eq(transactions.contractorId, contractors.id),
          gte(transactions.postedDate, yearStart),
          lte(transactions.postedDate, yearEnd)
        )
      )
      .where(eq(contractors.entityId, entity.id))
      .groupBy(
        contractors.id,
        contractors.legalName,
        contractors.dba,
        contractors.role,
        contractors.avatarUrl
      )
      .orderBy(
        desc(
          sql`coalesce(sum(case when ${transactions.amountCents} < 0 then -${transactions.amountCents} else 0 end), 0)`
        )
      )
      .limit(6),
    db
      .select({
        id: employees.id,
        legalName: employees.legalName,
        role: employees.role,
        kind: employees.employeeKind,
        avatarUrl: employees.avatarUrl,
        paidCents: sql<number>`coalesce(sum(case when ${transactions.amountCents} < 0 then -${transactions.amountCents} else 0 end), 0)::int`,
      })
      .from(employees)
      .leftJoin(
        transactions,
        and(
          eq(transactions.employeeId, employees.id),
          gte(transactions.postedDate, yearStart),
          lte(transactions.postedDate, yearEnd)
        )
      )
      .where(eq(employees.entityId, entity.id))
      .groupBy(
        employees.id,
        employees.legalName,
        employees.role,
        employees.employeeKind,
        employees.avatarUrl
      )
      .orderBy(asc(employees.employeeKind), asc(employees.legalName)),
    db
      .select({
        id: transactions.id,
        postedDate: transactions.postedDate,
        amountCents: transactions.amountCents,
        normalizedMerchant: transactions.normalizedMerchant,
        rawDescription: transactions.rawDescription,
        contractorName: contractors.legalName,
        employeeName: employees.legalName,
        accountName: bankAccounts.displayName,
      })
      .from(transactions)
      .innerJoin(bankAccounts, eq(bankAccounts.id, transactions.bankAccountId))
      .leftJoin(contractors, eq(contractors.id, transactions.contractorId))
      .leftJoin(employees, eq(employees.id, transactions.employeeId))
      .where(eq(transactions.entityId, entity.id))
      .orderBy(desc(transactions.postedDate))
      .limit(10),
    db
      .select({
        id: taxDeadlines.id,
        dueDate: taxDeadlines.dueDate,
        kind: taxDeadlines.kind,
        status: taxDeadlines.status,
        notes: taxDeadlines.notes,
      })
      .from(taxDeadlines)
      .where(
        and(
          eq(taxDeadlines.entityId, entity.id),
          ne(taxDeadlines.status, "paid"),
          gte(taxDeadlines.dueDate, todayISO)
        )
      )
      .orderBy(asc(taxDeadlines.dueDate))
      .limit(6),
    db
      .select({
        id: receipts.id,
        merchant: receipts.merchant,
        purchaseDate: receipts.purchaseDate,
        totalCents: receipts.totalCents,
        matchedTransactionId: receipts.matchedTransactionId,
      })
      .from(receipts)
      .where(eq(receipts.entityId, entity.id))
      .orderBy(desc(receipts.createdAt))
      .limit(6),
    db
      .select({
        id: llcPaperwork.id,
        docKind: llcPaperwork.docKind,
        filedDate: llcPaperwork.filedDate,
        expiresDate: llcPaperwork.expiresDate,
        notes: llcPaperwork.notes,
        blobUrl: llcPaperwork.blobUrl,
      })
      .from(llcPaperwork)
      .where(eq(llcPaperwork.entityId, entity.id))
      .orderBy(desc(llcPaperwork.filedDate))
      .limit(8),
    db
      .select({
        value: sql<number>`coalesce(count(${creditCardHolders.id}), 0)::int`,
      })
      .from(creditCardHolders)
      .innerJoin(
        bankAccounts,
        eq(bankAccounts.id, creditCardHolders.bankAccountId)
      )
      .where(eq(bankAccounts.entityId, entity.id)),
  ]);

  return (
    <Page>
      <div className="flex justify-end">
        <Link
          href={`/entities/${entity.slug}/edit`}
          className="rounded-full border border-[var(--border)] px-4 py-1.5 text-sm font-semibold hover:bg-[var(--surface-warm)] transition-colors"
        >
          Edit entity
        </Link>
      </div>

      {/* ───── Hero ───── */}
      <section className="relative overflow-hidden rounded-3xl border border-[var(--border)] shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
        <div className="relative h-[300px] sm:h-[360px] bg-[var(--surface-warm)]">
          <Image
            src={photo}
            alt={entity.name}
            fill
            priority
            className="object-cover"
            sizes="100vw"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0f172a]/85 via-[#0f172a]/30 to-transparent" />
          <div className="absolute inset-0 flex flex-col justify-end p-8 sm:p-10 text-white">
            <div className="flex flex-wrap gap-2 mb-3">
              <StatusPill tone="success">{kindLabel}</StatusPill>
              {entity.rentalClassification &&
                entity.rentalClassification !== "n_a" && (
                  <StatusPill tone="warning">
                    {entity.rentalClassification.toUpperCase()} rental
                  </StatusPill>
                )}
            </div>
            <h1 className="font-display text-3xl sm:text-4xl tracking-tight">
              {entity.name}
            </h1>
            {(entity.propertyAddress || entity.mailingAddress) && (
              <p className="mt-2 text-white/85 text-sm max-w-2xl">
                {entity.propertyAddress ?? entity.mailingAddress}
              </p>
            )}
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-[11px] uppercase tracking-[0.14em] text-white/75">
              {entity.ein && <span>EIN {entity.ein}</span>}
              {entity.state && <span>· {entity.state}</span>}
              {entity.phone && <span>· {entity.phone}</span>}
              {entity.stateEmployerId && (
                <span>· GA Employer {entity.stateEmployerId}</span>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ───── YTD stats ───── */}
      <section>
        <SectionHeader title={`${year} year to date`} />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            label="Transactions"
            value={stats.count.toLocaleString()}
            hint={`On ${accountsRows.length} account${accountsRows.length === 1 ? "" : "s"}`}
          />
          <StatTile
            label="Inflow"
            value={<Money cents={stats.inflow} />}
            tone="success"
          />
          <StatTile
            label="Outflow"
            value={<Money cents={stats.outflow} />}
            tone="danger"
          />
          <StatTile
            label="Net"
            value={<Money cents={stats.net} signed />}
            tone={stats.net >= 0 ? "success" : "danger"}
          />
        </div>
      </section>

      {/* ───── Two-column body ───── */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* LEFT 2/3: transactions + receipts */}
        <div className="lg:col-span-2 space-y-6">
          <section>
            <SectionHeader
              title="Recent transactions"
              hint={
                <Link
                  href={`/transactions`}
                  className="text-[var(--accent)] hover:underline"
                >
                  View all →
                </Link>
              }
            />
            {recentTxns.length === 0 ? (
              <EmptyState
                title="No transactions yet"
                description="Drop a statement or run the cobbvault backfill."
              />
            ) : (
              <Card>
                <ul className="divide-y divide-[var(--border)]">
                  {recentTxns.map((t) => (
                    <li key={t.id} className="px-5 py-3">
                      <Link
                        href={`/transactions?txn=${t.id}`}
                        className="flex items-baseline justify-between gap-3 hover:underline"
                      >
                        <span className="tabular text-xs text-[var(--muted)] w-20 shrink-0">
                          {t.postedDate}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-[var(--foreground)] truncate">
                            {t.normalizedMerchant ?? "—"}
                          </div>
                          <div className="text-xs text-[var(--muted)] truncate">
                            {t.contractorName
                              ? `1099 · ${t.contractorName}`
                              : t.employeeName
                                ? `Payroll · ${t.employeeName}`
                                : t.accountName}
                          </div>
                        </div>
                        <span className="font-semibold whitespace-nowrap">
                          <Money cents={t.amountCents} signed />
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </section>

          <section>
            <SectionHeader
              title="Recent receipts"
              hint={
                <Link
                  href="/receipts"
                  className="text-[var(--accent)] hover:underline"
                >
                  View all →
                </Link>
              }
            />
            {recentReceipts.length === 0 ? (
              <EmptyState
                title="No receipts yet"
                description={`Upload from /receipts or drop into the watcher folder.`}
              />
            ) : (
              <Card>
                <ul className="divide-y divide-[var(--border)]">
                  {recentReceipts.map((r) => (
                    <li key={r.id} className="px-5 py-3 text-sm">
                      <div className="flex items-baseline justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-medium truncate">
                            {r.merchant ?? "(unknown merchant)"}
                          </div>
                          <div className="text-xs text-[var(--muted)]">
                            {r.purchaseDate ?? "—"}
                          </div>
                        </div>
                        <div className="text-right">
                          <Money cents={r.totalCents} />
                          <div className="mt-0.5">
                            {r.matchedTransactionId ? (
                              <StatusPill tone="success">Matched</StatusPill>
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
          </section>
        </div>

        {/* RIGHT 1/3: people + deadlines + accounts */}
        <div className="space-y-6">
          <section>
            <SectionHeader
              title="Accounts"
              hint={
                cardHolderCount > 0 ? `${cardHolderCount} cardholders` : undefined
              }
            />
            {accountsRows.length === 0 ? (
              <EmptyState
                title="No accounts"
                description="Add one from /accounts."
              />
            ) : (
              <Card>
                <ul className="divide-y divide-[var(--border)] text-sm">
                  {accountsRows.map((a) => (
                    <li key={a.id} className="px-5 py-3">
                      <Link
                        href={`/accounts/${a.id}`}
                        className="block hover:underline"
                      >
                        <div className="font-medium">{a.displayName}</div>
                        <div className="text-xs text-[var(--muted)]">
                          {ACCOUNT_KIND[a.kind] ?? a.kind}
                          {" · "}
                          {a.last4 === "TBD" ? "last4 TBD" : `••${a.last4}`}
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </section>

          {(contractorRows.length > 0 || employeeRows.length > 0) && (
            <section>
              <SectionHeader
                title="People"
                hint={
                  <Link
                    href={`/contractors`}
                    className="text-[var(--accent)] hover:underline"
                  >
                    View all →
                  </Link>
                }
              />
              <Card>
                <ul className="divide-y divide-[var(--border)]">
                  {employeeRows.map((e) => (
                    <li key={e.id} className="px-5 py-3 text-sm">
                      <div className="flex items-center gap-3">
                        <Avatar src={e.avatarUrl} name={e.legalName} size={32} />
                        <div className="flex-1 min-w-0">
                          <Link
                            href={`/employees/${e.id}`}
                            className="font-medium hover:underline truncate"
                          >
                            {e.legalName}
                          </Link>
                          <div className="text-xs text-[var(--muted)]">
                            {e.kind === "minor_child" ? "Minor child" : "W-2"}
                            {e.role ? ` · ${e.role}` : ""}
                          </div>
                        </div>
                        <Money cents={e.paidCents} />
                      </div>
                    </li>
                  ))}
                  {contractorRows.map((c) => (
                    <li key={c.id} className="px-5 py-3 text-sm">
                      <div className="flex items-center gap-3">
                        <Avatar
                          src={c.avatarUrl}
                          name={c.dba ?? c.legalName}
                          size={32}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">
                            {c.dba ?? c.legalName}
                          </div>
                          <div className="text-xs text-[var(--muted)] truncate">
                            1099 · {c.role ?? "Contractor"}
                          </div>
                        </div>
                        <Money cents={c.paidCents} />
                      </div>
                    </li>
                  ))}
                </ul>
              </Card>
            </section>
          )}

          <section>
            <SectionHeader
              title="Upcoming deadlines"
              hint={
                <Link
                  href="/deadlines"
                  className="text-[var(--accent)] hover:underline"
                >
                  View all →
                </Link>
              }
            />
            {upcomingDeadlines.length === 0 ? (
              <EmptyState
                title="None upcoming"
                description="Auto-seed with npm run seed:deadlines."
              />
            ) : (
              <Card>
                <ul className="divide-y divide-[var(--border)] text-sm">
                  {upcomingDeadlines.map((d) => {
                    const days = daysUntil(d.dueDate, today);
                    return (
                      <li key={d.id} className="px-5 py-3">
                        <div className="flex items-baseline justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-medium">
                              {DEADLINE_KIND[d.kind] ?? d.kind}
                            </div>
                            {d.notes && (
                              <div className="text-xs text-[var(--muted)] truncate">
                                {d.notes}
                              </div>
                            )}
                          </div>
                          <div className="text-right">
                            <div className="tabular font-medium">{d.dueDate}</div>
                            <div className="text-xs text-[var(--muted)]">
                              {days === 0 ? "today" : `in ${days}d`}
                            </div>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            )}
          </section>

          <section>
            <SectionHeader title="Documents" />
            {paperworkRows.length === 0 ? (
              <Card tone="warm" className="px-5 py-6 text-sm text-[var(--muted)]">
                No documents on file yet. Operating agreement, EIN letter,
                annual report, insurance, deed, lease, mortgage note — all live
                here once uploaded.
              </Card>
            ) : (
              <Card>
                <ul className="divide-y divide-[var(--border)] text-sm">
                  {paperworkRows.map((p) => (
                    <li key={p.id} className="px-5 py-3">
                      <a
                        href={p.blobUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block hover:underline"
                      >
                        <div className="font-medium capitalize">
                          {p.docKind.replace(/_/g, " ")}
                        </div>
                        <div className="text-xs text-[var(--muted)]">
                          {p.filedDate ? `Filed ${p.filedDate}` : "—"}
                          {p.expiresDate ? ` · expires ${p.expiresDate}` : ""}
                        </div>
                      </a>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </section>
        </div>
      </div>

      {entity.notes && (
        <Card tone="warm" className="px-6 py-5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)] mb-2">
            Notes
          </div>
          <div className="text-sm text-[var(--body)]">{entity.notes}</div>
        </Card>
      )}
    </Page>
  );
}
