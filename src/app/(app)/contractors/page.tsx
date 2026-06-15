import Link from "next/link";
import { db } from "@/lib/db";
import { contractors, transactions, entities } from "@/lib/db/schema";
import { getActiveScope } from "@/lib/scope";
import { eq, sql, and, gte, lte, desc, asc, isNotNull } from "drizzle-orm";
import {
  Page,
  PageHeader,
  Card,
  StatTile,
  EmptyState,
  StatusPill,
  Money,
  Callout,
  ButtonLink,
  Avatar,
} from "@/components/ui";

export const dynamic = "force-dynamic";

const THRESHOLD_CENTS = 60_000; // $600

type SP = Promise<{ year?: string }>;

function parseYear(raw: string | undefined): number {
  const now = new Date();
  const cur = now.getFullYear();
  const n = Number(raw);
  return Number.isFinite(n) && n >= 2000 && n <= cur + 1 ? Math.floor(n) : cur;
}

export default async function ContractorsPage({
  searchParams,
}: {
  searchParams: SP;
}) {
  const sp = await searchParams;
  const year = parseYear(sp.year);
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  const scope = await getActiveScope();

  // For the YoY "this year vs same-period last year" overview.
  // Cut both ranges at today's month/day so we compare like-for-like.
  const today = new Date();
  const currentYear = today.getFullYear();
  const mm = String(today.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(today.getUTCDate()).padStart(2, "0");
  const isCurrentYear = year === currentYear;
  const ytdEnd = `${year}-${mm}-${dd}`;
  const priorYear = year - 1;
  const priorYtdStart = `${priorYear}-01-01`;
  const priorYtdEnd = `${priorYear}-${mm}-${dd}`;
  const showPtcOverview =
    isCurrentYear && scope.entity?.slug === "path-to-change";

  // Year-bounded aggregate of payments per contractor.
  // Payments are NEGATIVE (debits) on the transaction row; we report the
  // absolute value for human display.
  const where = scope.entity
    ? eq(contractors.entityId, scope.entity.id)
    : undefined;

  const rows = await db
    .select({
      id: contractors.id,
      legalName: contractors.legalName,
      dba: contractors.dba,
      role: contractors.role,
      avatarUrl: contractors.avatarUrl,
      entityId: contractors.entityId,
      entitySlug: entities.slug,
      entityName: entities.name,
      w9DocUrl: contractors.w9DocUrl,
      w9OnFile: contractors.w9OnFile,
      feeKeepPercent: contractors.feeKeepPercent,
      txnCount: sql<number>`coalesce(count(${transactions.id}), 0)::int`,
      // SUM of NEGATIVE amounts → multiply by -1 for display as "paid".
      paidCents: sql<number>`coalesce(sum(case when ${transactions.amountCents} < 0 then -${transactions.amountCents} else 0 end), 0)::int`,
    })
    .from(contractors)
    .innerJoin(entities, eq(entities.id, contractors.entityId))
    .leftJoin(
      transactions,
      and(
        eq(transactions.contractorId, contractors.id),
        gte(transactions.postedDate, yearStart),
        lte(transactions.postedDate, yearEnd)
      )
    )
    .where(where!)
    .groupBy(
      contractors.id,
      contractors.legalName,
      contractors.dba,
      contractors.role,
      contractors.avatarUrl,
      contractors.entityId,
      contractors.w9DocUrl,
      contractors.w9OnFile,
      contractors.feeKeepPercent,
      entities.slug,
      entities.name
    )
    .orderBy(desc(sql`coalesce(sum(case when ${transactions.amountCents} < 0 then -${transactions.amountCents} else 0 end), 0)`), asc(contractors.legalName));

  const w9Held = (r: typeof rows[number]) => !!r.w9DocUrl || r.w9OnFile;
  const totalPaid = rows.reduce((s, r) => s + r.paidCents, 0);
  const overThreshold = rows.filter((r) => r.paidCents >= THRESHOLD_CENTS);
  const missingW9 = rows.filter((r) => !w9Held(r));
  const overWithoutW9 = overThreshold.filter((r) => !w9Held(r));

  // YoY comparison data — cut both ranges at today's MM-DD for apples-to-apples.
  // Also re-bound the CURRENT year at today, since rows above bounds the
  // full year (Jan 1 → Dec 31). Future dates won't exist anyway, but
  // being explicit keeps the comparison honest.
  type YoY = {
    id: string;
    legalName: string;
    dba: string | null;
    role: string | null;
    avatarUrl: string | null;
    feeKeepPercent: number | null;
    paidCurCents: number;
    paidPriorCents: number;
  };
  let ytdRows: YoY[] = [];
  if (showPtcOverview && scope.entity) {
    const [curAgg, priorAgg] = await Promise.all([
      db
        .select({
          id: contractors.id,
          paidCents: sql<number>`coalesce(sum(case when ${transactions.amountCents} < 0 then -${transactions.amountCents} else 0 end), 0)::int`,
        })
        .from(contractors)
        .leftJoin(
          transactions,
          and(
            eq(transactions.contractorId, contractors.id),
            gte(transactions.postedDate, yearStart),
            lte(transactions.postedDate, ytdEnd)
          )
        )
        .where(
          and(
            eq(contractors.entityId, scope.entity.id),
            eq(contractors.isCounselor, true)
          )
        )
        .groupBy(contractors.id),
      db
        .select({
          id: contractors.id,
          paidCents: sql<number>`coalesce(sum(case when ${transactions.amountCents} < 0 then -${transactions.amountCents} else 0 end), 0)::int`,
        })
        .from(contractors)
        .leftJoin(
          transactions,
          and(
            eq(transactions.contractorId, contractors.id),
            gte(transactions.postedDate, priorYtdStart),
            lte(transactions.postedDate, priorYtdEnd)
          )
        )
        .where(
          and(
            eq(contractors.entityId, scope.entity.id),
            eq(contractors.isCounselor, true)
          )
        )
        .groupBy(contractors.id),
    ]);
    const curMap = new Map(curAgg.map((r) => [r.id, r.paidCents]));
    const priorMap = new Map(priorAgg.map((r) => [r.id, r.paidCents]));
    // Also filter the rows list (from the main query) by is_counselor
    // so the YoY view only includes counselors. Utility 1099s (landlords,
    // cleaning) stay on the main table below for tax tracking.
    ytdRows = rows
      .filter((r) => curMap.has(r.id)) // only counselor-flagged ids
      .map((r) => ({
        id: r.id,
        legalName: r.legalName,
        dba: r.dba,
        role: r.role,
        avatarUrl: r.avatarUrl,
        feeKeepPercent: r.feeKeepPercent,
        paidCurCents: curMap.get(r.id) ?? 0,
        paidPriorCents: priorMap.get(r.id) ?? 0,
      }))
      // Hide rows with no activity either year
      .filter((r) => r.paidCurCents > 0 || r.paidPriorCents > 0)
      .sort((a, b) => b.paidCurCents - a.paidCurCents);
  }

  // Helper: convert counselor's take (what we paid) into gross at their keep %.
  // Falls back to take when no keep % set (no fee-split known).
  function grossCents(takeCents: number, keepPct: number | null): number {
    if (!keepPct || keepPct <= 0 || keepPct > 100) return takeCents;
    return Math.round(takeCents / (keepPct / 100));
  }

  const exportHref = scope.entity
    ? `/contractors/export?entity=${scope.entity.slug}&year=${year}`
    : `/contractors/export?year=${year}`;

  return (
    <Page>
      <PageHeader
        title="1099 contractors"
        subtitle={
          scope.entity
            ? `Scoped to ${scope.entity.name} · tax year ${year}.`
            : `All entities · tax year ${year}.`
        }
        actions={
          rows.length > 0 ? (
            <ButtonLink href={exportHref}>Export 1099 CSV</ButtonLink>
          ) : undefined
        }
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-4">
        <StatTile
          label="Contractors"
          value={rows.length.toLocaleString()}
        />
        <StatTile
          label={`Paid ${year}`}
          value={<Money cents={totalPaid} />}
        />
        <StatTile
          label={`Over $600`}
          value={overThreshold.length.toLocaleString()}
          tone={overWithoutW9.length > 0 ? "warning" : "neutral"}
          hint={
            overWithoutW9.length > 0
              ? `${overWithoutW9.length} missing W-9`
              : undefined
          }
        />
        <StatTile
          label="Missing W-9"
          value={missingW9.length.toLocaleString()}
          tone={missingW9.length > 0 ? "warning" : "neutral"}
        />
      </div>

      {showPtcOverview && ytdRows.length > 0 && (
        <section className="mb-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
            <h2 className="font-display text-2xl tracking-tight">
              Counselor YTD — {year} vs {priorYear}
            </h2>
            <span className="text-xs text-[var(--muted)] tabular">
              Through {ytdEnd.slice(5)} both years · gross fee at counselor&apos;s keep %
            </span>
          </div>
          <Card>
            <div className="overflow-x-auto">
              <table className="hidden md:table w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-left text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">
                    <th className="px-5 py-3 font-semibold">Counselor</th>
                    <th className="px-5 py-3 font-semibold text-right whitespace-nowrap">
                      {year} YTD gross
                    </th>
                    <th className="px-5 py-3 font-semibold text-right whitespace-nowrap">
                      {priorYear} same period
                    </th>
                    <th className="px-5 py-3 font-semibold text-right whitespace-nowrap">
                      Δ
                    </th>
                    <th className="px-5 py-3 font-semibold text-right whitespace-nowrap">
                      Δ %
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {ytdRows.map((r) => {
                    const curGross = grossCents(r.paidCurCents, r.feeKeepPercent);
                    const priorGross = grossCents(r.paidPriorCents, r.feeKeepPercent);
                    const delta = curGross - priorGross;
                    const pct =
                      priorGross > 0
                        ? Math.round((delta / priorGross) * 1000) / 10
                        : null;
                    const up = delta > 0;
                    const down = delta < 0;
                    return (
                      <tr
                        key={r.id}
                        className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface-warm)] transition-colors"
                      >
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            <Avatar
                              src={r.avatarUrl}
                              name={r.dba ?? r.legalName}
                              size={36}
                            />
                            <div>
                              <Link
                                href={`/contractors/${r.id}`}
                                className="font-medium hover:underline"
                              >
                                {r.dba ?? r.legalName}
                              </Link>
                              {r.feeKeepPercent != null && (
                                <div className="text-xs text-[var(--muted)]">
                                  Counselor {r.feeKeepPercent}%
                                </div>
                              )}
                              {r.feeKeepPercent == null && (
                                <div className="text-xs text-[var(--muted)] italic">
                                  No keep % set — showing take
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-right tabular whitespace-nowrap font-semibold">
                          <Money cents={curGross} />
                        </td>
                        <td className="px-5 py-3.5 text-right tabular whitespace-nowrap text-[var(--muted)]">
                          <Money cents={priorGross} />
                        </td>
                        <td
                          className={[
                            "px-5 py-3.5 text-right tabular whitespace-nowrap font-medium",
                            up
                              ? "text-[var(--accent)]"
                              : down
                                ? "text-[var(--danger)]"
                                : "text-[var(--muted)]",
                          ].join(" ")}
                        >
                          {up ? "↑ " : down ? "↓ " : ""}
                          <Money cents={Math.abs(delta)} />
                        </td>
                        <td
                          className={[
                            "px-5 py-3.5 text-right tabular whitespace-nowrap text-xs",
                            up
                              ? "text-[var(--accent)]"
                              : down
                                ? "text-[var(--danger)]"
                                : "text-[var(--muted)]",
                          ].join(" ")}
                        >
                          {pct == null
                            ? "—"
                            : `${pct > 0 ? "+" : ""}${pct.toFixed(1)}%`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  {(() => {
                    const curTotal = ytdRows.reduce(
                      (s, r) => s + grossCents(r.paidCurCents, r.feeKeepPercent),
                      0
                    );
                    const priorTotal = ytdRows.reduce(
                      (s, r) => s + grossCents(r.paidPriorCents, r.feeKeepPercent),
                      0
                    );
                    const delta = curTotal - priorTotal;
                    const pct =
                      priorTotal > 0
                        ? Math.round((delta / priorTotal) * 1000) / 10
                        : null;
                    return (
                      <tr className="border-t-2 border-[var(--border-strong)] bg-[var(--surface-warm)]">
                        <td className="px-5 py-3 font-semibold">All counselors</td>
                        <td className="px-5 py-3 text-right tabular font-semibold">
                          <Money cents={curTotal} />
                        </td>
                        <td className="px-5 py-3 text-right tabular text-[var(--muted)]">
                          <Money cents={priorTotal} />
                        </td>
                        <td
                          className={[
                            "px-5 py-3 text-right tabular font-semibold",
                            delta > 0
                              ? "text-[var(--accent)]"
                              : delta < 0
                                ? "text-[var(--danger)]"
                                : "text-[var(--muted)]",
                          ].join(" ")}
                        >
                          {delta > 0 ? "↑ " : delta < 0 ? "↓ " : ""}
                          <Money cents={Math.abs(delta)} />
                        </td>
                        <td
                          className={[
                            "px-5 py-3 text-right tabular text-xs",
                            delta > 0
                              ? "text-[var(--accent)]"
                              : delta < 0
                                ? "text-[var(--danger)]"
                                : "text-[var(--muted)]",
                          ].join(" ")}
                        >
                          {pct == null
                            ? "—"
                            : `${pct > 0 ? "+" : ""}${pct.toFixed(1)}%`}
                        </td>
                      </tr>
                    );
                  })()}
                </tfoot>
              </table>

              {/* Mobile: counselor YoY cards */}
              <ul className="md:hidden divide-y divide-[var(--border)]">
                {ytdRows.map((r) => {
                  const curGross = grossCents(r.paidCurCents, r.feeKeepPercent);
                  const priorGross = grossCents(r.paidPriorCents, r.feeKeepPercent);
                  const delta = curGross - priorGross;
                  const pct =
                    priorGross > 0
                      ? Math.round((delta / priorGross) * 1000) / 10
                      : null;
                  const up = delta > 0;
                  const down = delta < 0;
                  const tone = up
                    ? "text-[var(--accent)]"
                    : down
                      ? "text-[var(--danger)]"
                      : "text-[var(--muted)]";
                  return (
                    <li key={r.id} className="flex items-center gap-3 py-3">
                      <Avatar src={r.avatarUrl} name={r.dba ?? r.legalName} size={36} />
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/contractors/${r.id}`}
                          className="font-medium hover:underline truncate block"
                        >
                          {r.dba ?? r.legalName}
                        </Link>
                        <div className="text-xs text-[var(--muted)]">
                          {priorYear}: <Money cents={priorGross} />
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="font-semibold">
                          <Money cents={curGross} />
                        </div>
                        <div className={`text-xs tabular ${tone}`}>
                          {up ? "↑" : down ? "↓" : ""}{" "}
                          {pct == null ? "—" : `${pct > 0 ? "+" : ""}${pct.toFixed(1)}%`}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </Card>
        </section>
      )}

      {overWithoutW9.length > 0 && (
        <div className="mb-6">
          <Callout title={`${overWithoutW9.length} contractor${overWithoutW9.length === 1 ? "" : "s"} require a 1099 but have no W-9 on file`} tone="warning">
            IRS triggers a 1099-NEC at $600/yr per contractor. Get a W-9 before Jan 31{" "}
            {year + 1}.
            <ul className="mt-2 list-disc pl-5">
              {overWithoutW9.slice(0, 5).map((r) => (
                <li key={r.id}>
                  {r.legalName} — <Money cents={r.paidCents} /> at{" "}
                  {r.entityName}
                </li>
              ))}
              {overWithoutW9.length > 5 && (
                <li className="text-[var(--muted)]">
                  + {overWithoutW9.length - 5} more
                </li>
              )}
            </ul>
          </Callout>
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState
          title="No contractors yet"
          description={
            <>
              Tag a transaction to a contractor on{" "}
              <Link href="/transactions" className="underline">
                /transactions
              </Link>
              . The first tag creates the contractor; subsequent ones add to
              their YTD total here.
            </>
          }
        />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="hidden md:table w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">
                  <th className="px-5 py-3 font-semibold">Contractor</th>
                  {!scope.entity && <th className="px-5 py-3 font-semibold">Entity</th>}
                  <th className="px-5 py-3 font-semibold text-right whitespace-nowrap">
                    Payments
                  </th>
                  <th className="px-5 py-3 font-semibold text-right whitespace-nowrap">
                    YTD {year}
                  </th>
                  <th className="px-5 py-3 font-semibold whitespace-nowrap">W-9</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const over = r.paidCents >= THRESHOLD_CENTS;
                  const filterHref = `/transactions?q=${encodeURIComponent(r.legalName)}`;
                  return (
                    <tr
                      key={r.id}
                      className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface-warm)] transition-colors"
                    >
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <Avatar src={r.avatarUrl} name={r.dba ?? r.legalName} size={40} />
                          <div>
                            <Link
                              href={`/contractors/${r.id}`}
                              className="font-medium hover:underline text-[var(--foreground)]"
                            >
                              {r.dba ?? r.legalName}
                            </Link>
                            {r.role && (
                              <div className="text-xs text-[var(--muted)]">
                                {r.role}
                              </div>
                            )}
                            {r.dba && (
                              <div className="text-xs text-[var(--muted)]">
                                1099: {r.legalName}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      {!scope.entity && (
                        <td className="px-5 py-3.5 text-[var(--muted)]">
                          {r.entityName}
                        </td>
                      )}
                      <td className="px-5 py-3.5 text-right tabular whitespace-nowrap text-[var(--body)]">
                        {r.txnCount}
                      </td>
                      <td className="px-5 py-3.5 text-right whitespace-nowrap font-semibold">
                        <Money cents={r.paidCents} />
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        {r.w9DocUrl ? (
                          <StatusPill tone="success">On file</StatusPill>
                        ) : r.w9OnFile ? (
                          <StatusPill tone="success">On file (no PDF)</StatusPill>
                        ) : over ? (
                          <StatusPill tone="warning">Missing — needed</StatusPill>
                        ) : (
                          <StatusPill tone="neutral">Missing</StatusPill>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Mobile: contractor cards */}
            <ul className="md:hidden divide-y divide-[var(--border)]">
              {rows.map((r) => {
                const over = r.paidCents >= THRESHOLD_CENTS;
                return (
                  <li key={r.id} className="py-3">
                    <div className="flex items-start gap-3">
                      <Avatar src={r.avatarUrl} name={r.dba ?? r.legalName} size={40} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-3">
                          <Link
                            href={`/contractors/${r.id}`}
                            className="font-medium text-[var(--foreground)] hover:underline truncate"
                          >
                            {r.dba ?? r.legalName}
                          </Link>
                          <span className="shrink-0 font-semibold">
                            <Money cents={r.paidCents} />
                          </span>
                        </div>
                        <div className="mt-0.5 text-xs text-[var(--muted)]">
                          {r.role ? `${r.role} · ` : ""}
                          {r.txnCount} payment{r.txnCount === 1 ? "" : "s"} · {year}
                          {!scope.entity ? ` · ${r.entityName}` : ""}
                        </div>
                        <div className="mt-1.5">
                          {r.w9DocUrl ? (
                            <StatusPill tone="success">W-9 on file</StatusPill>
                          ) : r.w9OnFile ? (
                            <StatusPill tone="success">W-9 on file (no PDF)</StatusPill>
                          ) : over ? (
                            <StatusPill tone="warning">W-9 missing — needed</StatusPill>
                          ) : (
                            <StatusPill tone="neutral">W-9 missing</StatusPill>
                          )}
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </Card>
      )}
    </Page>
  );
}
