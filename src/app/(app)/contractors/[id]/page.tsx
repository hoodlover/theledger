import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import {
  contractors,
  transactions,
  entities,
  bankAccounts,
  contractorPaperwork,
} from "@/lib/db/schema";
import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
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
import {
  ContractorEditForm,
  W9Uploader,
  CounselorEarnings,
  ContractorPicker,
  UntaggedMatchesPanel,
  PaperworkBox,
  ApplyOnboardingButton,
} from "./_client";

// Tokens we strip when building name-prefix patterns for the
// "untagged matches" search. Match-stopwords: business suffixes and
// 1-2 letter words.
const STOP_TOKENS = new Set([
  "llc",
  "inc",
  "co",
  "corp",
  "corporation",
  "ltd",
  "pllc",
  "pa",
  "pc",
  "lp",
  "the",
  "and",
  "of",
  "for",
  "to",
  "an",
]);

// Build name-token prefixes that survive bank-statement truncation.
// Each prefix is the first 4 chars (or full token if shorter) of every
// substantive token in the contractor name. We require ALL prefixes to
// appear in raw_description for a transaction to be a candidate match.
function buildNamePrefixes(...sources: (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const prefixes: string[] = [];
  for (const s of sources) {
    if (!s) continue;
    const tokens = s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter(Boolean);
    for (const t of tokens) {
      if (STOP_TOKENS.has(t)) continue;
      if (t.length < 3) continue;
      const p = t.slice(0, Math.min(4, t.length));
      if (seen.has(p)) continue;
      seen.add(p);
      prefixes.push(p);
    }
  }
  return prefixes;
}

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

  // ───── Contractor picker options (all contractors in the same entity
  // first, then everyone else alphabetical) ─────
  const pickerRows = await db
    .select({
      id: contractors.id,
      legalName: contractors.legalName,
      dba: contractors.dba,
      entityId: contractors.entityId,
      entityName: entities.name,
    })
    .from(contractors)
    .innerJoin(entities, eq(entities.id, contractors.entityId))
    .orderBy(asc(contractors.legalName));
  const pickerOptions = (() => {
    const sameEntity = pickerRows.filter((r) => r.entityId === c.entityId);
    const others = pickerRows.filter((r) => r.entityId !== c.entityId);
    const opts: { id: string; label: string }[] = [];
    for (const r of sameEntity) {
      opts.push({ id: r.id, label: r.dba ?? r.legalName });
    }
    if (others.length > 0) {
      for (const r of others) {
        opts.push({
          id: r.id,
          label: `${r.dba ?? r.legalName}  ·  ${r.entityName}`,
        });
      }
    }
    return opts;
  })();

  // ───── Untagged-match search ─────
  // Find debit-side transactions in this contractor's entity whose
  // raw_description hits every name-prefix and have no contractor tag.
  // This rescues cases where the bank truncates names ("JUAN DAVID MEJI"
  // for Juan Mejia) and auto-tag missed them.
  const prefixes = buildNamePrefixes(c.legalName, c.dba);
  let matches: {
    id: string;
    postedDate: string;
    amountCents: number;
    rawDescription: string;
    accountName: string;
  }[] = [];
  if (prefixes.length > 0) {
    const conds = [
      eq(transactions.entityId, c.entityId),
      sql`${transactions.contractorId} IS NULL`,
      sql`${transactions.amountCents} < 0`,
      ...prefixes.map(
        (p) => sql`lower(${transactions.rawDescription}) like ${"%" + p + "%"}`
      ),
    ];
    matches = await db
      .select({
        id: transactions.id,
        postedDate: transactions.postedDate,
        amountCents: transactions.amountCents,
        rawDescription: transactions.rawDescription,
        accountName: bankAccounts.displayName,
      })
      .from(transactions)
      .innerJoin(bankAccounts, eq(bankAccounts.id, transactions.bankAccountId))
      .where(and(...conds))
      .orderBy(desc(transactions.postedDate))
      .limit(50);
  }
  const patternHint = prefixes.length > 0 ? prefixes.join(" + ") : "—";

  // ───── Paperwork ─────
  const paperworkRows = await db
    .select({
      id: contractorPaperwork.id,
      kind: contractorPaperwork.kind,
      displayName: contractorPaperwork.displayName,
      blobUrl: contractorPaperwork.blobUrl,
      effectiveDate: contractorPaperwork.effectiveDate,
      expirationDate: contractorPaperwork.expirationDate,
      createdAt: contractorPaperwork.createdAt,
    })
    .from(contractorPaperwork)
    .where(eq(contractorPaperwork.contractorId, c.id))
    .orderBy(desc(contractorPaperwork.createdAt));

  const paperworkItems = paperworkRows.map((p) => ({
    id: p.id,
    kind: p.kind,
    displayName: p.displayName,
    blobUrl: p.blobUrl,
    effectiveDate: p.effectiveDate,
    expirationDate: p.expirationDate,
    createdAt: p.createdAt.toISOString(),
  }));

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
        <div className="flex items-center gap-3 flex-wrap justify-end">
          <ContractorPicker currentId={c.id} options={pickerOptions} />
          <Link
            href="/contractors"
            className="rounded-full border border-[var(--border)] px-4 py-1.5 text-sm text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface-warm)] transition-colors"
          >
            &larr; All
          </Link>
        </div>
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

      {matches.length > 0 && (
        <UntaggedMatchesPanel
          contractorId={c.id}
          contractorDisplay={display}
          matches={matches.map((m) => ({
            id: m.id,
            postedDate: m.postedDate,
            amountCents: m.amountCents,
            rawDescription: m.rawDescription,
            accountName: m.accountName,
          }))}
          patternHint={patternHint}
        />
      )}

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
                <a
                  href={`/contractors/${c.id}/comp-export?year=${year}`}
                  className="text-xs text-[var(--accent)] hover:underline"
                >
                  Export {year} CSV →
                </a>
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

          <section>
            <SectionHeader title="Paperwork" />
            <Card className="p-5">
              <PaperworkBox contractorId={c.id} items={paperworkItems} />
            </Card>
          </section>

          <section>
            <SectionHeader title="Onboarding" />
            <Card className="p-5">
              <ApplyOnboardingButton
                entityId={c.entityId}
                contractorId={c.id}
              />
              <p className="text-[10px] text-[var(--muted)] mt-2">
                Generates the standard checklist (W-9, contract, malpractice
                cert, fee %, supervision, 30-day check-in, etc.) as tasks
                assigned to you. Open them at /practice/tasks.
              </p>
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
