import Link from "next/link";
import { db } from "@/lib/db";
import {
  entities,
  contractors,
  practiceClients,
  practiceClientCounselors,
  practiceSessions,
  practiceEvents,
  transactions,
} from "@/lib/db/schema";
import { and, asc, desc, eq, gte, isNotNull, isNull, lte, sql } from "drizzle-orm";
import {
  Page,
  PageHeader,
  Card,
  StatTile,
  EmptyState,
  Money,
  Callout,
  Avatar,
  SectionHeader,
  StatusPill,
} from "@/components/ui";
import {
  LogInquiryButton,
  LogSessionButton,
  SessionFlagButtons,
  ResolveEventRow,
  type CounselorOption,
  type ClientOption,
} from "./_client";
import { logPhiRead } from "@/lib/audit";

export const dynamic = "force-dynamic";

const COHORT_MILESTONES = [1, 2, 3, 5, 10, 20, 40];

function startOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}
function startOfPriorMonthSameDay(d: Date): { from: Date; to: Date } {
  // Same calendar day a year ago, used as a comparison window.
  const y = d.getUTCFullYear() - 1;
  return {
    from: new Date(Date.UTC(y, d.getUTCMonth(), 1)),
    to: new Date(Date.UTC(y, d.getUTCMonth(), d.getUTCDate(), 23, 59, 59)),
  };
}

function safePct(num: number, denom: number): number {
  return denom > 0 ? Math.round((num / denom) * 1000) / 10 : 0;
}

export default async function PracticePage() {
  // Resolve Path to Change entity. This dashboard is PtC-specific.
  const [entity] = await db
    .select({ id: entities.id, name: entities.name })
    .from(entities)
    .where(eq(entities.slug, "path-to-change"));
  if (!entity) {
    return (
      <Page>
        <EmptyState
          title="Path to Change entity not found"
          description="Seed the entity first via npm run db:seed."
        />
      </Page>
    );
  }

  const now = new Date();
  const mtdStart = startOfMonth(now);
  const prior = startOfPriorMonthSameDay(now);
  const prior48h = new Date(now.getTime() - 48 * 60 * 60 * 1000);
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // ───────── Parallel data load ─────────
  const [
    [activeClientsAgg],
    [awaitingFirstAgg],
    mtdSessionRows,
    priorMtdSessionRows,
    counselorRoster,
    leaderboardRaw,
    cohortClients,
    sourceRollup,
    unresolvedEvents,
    recentSessions,
    clientList,
    contractorPaymentsThisMonth,
  ] = await Promise.all([
    db
      .select({ value: sql<number>`count(*)::int` })
      .from(practiceClients)
      .where(
        and(
          eq(practiceClients.entityId, entity.id),
          eq(practiceClients.status, "active"),
          isNull(practiceClients.archivedAt)
        )
      ),
    db
      .select({ value: sql<number>`count(*)::int` })
      .from(practiceClients)
      .where(
        and(
          eq(practiceClients.entityId, entity.id),
          isNull(practiceClients.firstSessionAt),
          isNotNull(practiceClients.firstScheduledAt)
        )
      ),
    db
      .select({
        id: practiceSessions.id,
        clientId: practiceSessions.clientId,
        counselorId: practiceSessions.counselorId,
        scheduledFor: practiceSessions.scheduledFor,
        completedAt: practiceSessions.completedAt,
        noShow: practiceSessions.noShow,
        cancelled: practiceSessions.cancelled,
        feeCents: practiceSessions.feeCents,
      })
      .from(practiceSessions)
      .where(
        and(
          eq(practiceSessions.entityId, entity.id),
          gte(practiceSessions.scheduledFor, mtdStart)
        )
      ),
    db
      .select({
        id: practiceSessions.id,
        feeCents: practiceSessions.feeCents,
        noShow: practiceSessions.noShow,
        cancelled: practiceSessions.cancelled,
      })
      .from(practiceSessions)
      .where(
        and(
          eq(practiceSessions.entityId, entity.id),
          gte(practiceSessions.scheduledFor, prior.from),
          lte(practiceSessions.scheduledFor, prior.to)
        )
      ),
    db
      .select({
        id: contractors.id,
        legalName: contractors.legalName,
        dba: contractors.dba,
        feeKeepPercent: contractors.feeKeepPercent,
        avatarUrl: contractors.avatarUrl,
      })
      .from(contractors)
      .where(eq(contractors.entityId, entity.id))
      .orderBy(asc(contractors.legalName)),
    // Counselor leaderboard aggregate — active caseload + sessions MTD + avg engagement
    db
      .select({
        counselorId: contractors.id,
        activeCaseload: sql<number>`coalesce((
          select count(*)::int from practice_clients pc
           where pc.primary_counselor_id = ${contractors.id}
             and pc.status = 'active' and pc.archived_at is null
        ), 0)`,
        // avg engagement in months (last - first) / 30, NULL clients ignored
        avgEngagementMonths: sql<number | null>`(
          select coalesce(round(avg(
            extract(epoch from (last_session_at - first_session_at)) / 86400 / 30
          )::numeric, 1), 0)::numeric
            from practice_clients pc
           where pc.primary_counselor_id = ${contractors.id}
             and pc.first_session_at is not null
             and pc.last_session_at is not null
        )`,
      })
      .from(contractors)
      .where(eq(contractors.entityId, entity.id)),
    // For per-counselor cohorts — every client w/ first session + total sessions
    db
      .select({
        primaryCounselorId: practiceClients.primaryCounselorId,
        totalSessions: practiceClients.totalSessions,
        firstSessionAt: practiceClients.firstSessionAt,
        lastSessionAt: practiceClients.lastSessionAt,
      })
      .from(practiceClients)
      .where(
        and(
          eq(practiceClients.entityId, entity.id),
          isNotNull(practiceClients.firstSessionAt)
        )
      ),
    // Where this month's clients came from
    db
      .select({
        source: practiceClients.source,
        n: sql<number>`count(*)::int`,
      })
      .from(practiceClients)
      .where(
        and(
          eq(practiceClients.entityId, entity.id),
          gte(practiceClients.createdAt, mtdStart)
        )
      )
      .groupBy(practiceClients.source),
    // Inbox: unresolved practice_events newest first
    db
      .select({
        id: practiceEvents.id,
        kind: practiceEvents.kind,
        source: practiceEvents.source,
        occurredAt: practiceEvents.occurredAt,
        payload: practiceEvents.payload,
      })
      .from(practiceEvents)
      .where(
        and(
          eq(practiceEvents.entityId, entity.id),
          isNull(practiceEvents.resolvedAt)
        )
      )
      .orderBy(desc(practiceEvents.occurredAt))
      .limit(20),
    db
      .select({
        id: practiceSessions.id,
        clientId: practiceSessions.clientId,
        counselorId: practiceSessions.counselorId,
        scheduledFor: practiceSessions.scheduledFor,
        completedAt: practiceSessions.completedAt,
        noShow: practiceSessions.noShow,
        cancelled: practiceSessions.cancelled,
        feeCents: practiceSessions.feeCents,
      })
      .from(practiceSessions)
      .where(eq(practiceSessions.entityId, entity.id))
      .orderBy(desc(practiceSessions.scheduledFor))
      .limit(15),
    db
      .select({
        id: practiceClients.id,
        displayInitials: practiceClients.displayInitials,
        preferredFirstName: practiceClients.preferredFirstName,
        status: practiceClients.status,
      })
      .from(practiceClients)
      .where(eq(practiceClients.entityId, entity.id))
      .orderBy(asc(practiceClients.displayInitials)),
    // Fallback "revenue" signal: until TherapyNotes ingest lands and
    // practice_sessions has fees, pull the contractor-payment total
    // for the month from the bank ledger so the revenue tile isn't 0.
    db
      .select({
        counselorId: transactions.contractorId,
        paidCents: sql<number>`coalesce(sum(case when ${transactions.amountCents} < 0 then -${transactions.amountCents} else 0 end), 0)::int`,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.entityId, entity.id),
          isNotNull(transactions.contractorId),
          gte(transactions.postedDate, mtdStart.toISOString().slice(0, 10))
        )
      )
      .groupBy(transactions.contractorId),
  ]);

  // PHI access marker (called once with count, not per-row)
  await logPhiRead({
    context: "/practice dashboard",
    count: clientList.length,
  });

  // ───────── Derived metrics ─────────

  const activeClients = activeClientsAgg?.value ?? 0;
  const awaitingFirst = awaitingFirstAgg?.value ?? 0;

  const sessionsMtd = mtdSessionRows.filter((s) => !s.cancelled).length;
  const noShowMtd = mtdSessionRows.filter((s) => s.noShow).length;
  const noShowPct = safePct(noShowMtd, sessionsMtd);
  const grossMtdFromSessions = mtdSessionRows
    .filter((s) => !s.noShow && !s.cancelled)
    .reduce((acc, s) => acc + (s.feeCents ?? 0), 0);
  // Bank-ledger fallback when sessions don't have fees set yet
  const counselorTakeFromBank = contractorPaymentsThisMonth.reduce(
    (s, r) => s + r.paidCents,
    0
  );
  // For revenue: prefer session-derived gross if we have any; else use bank
  const mtdRevenueCents =
    grossMtdFromSessions > 0 ? grossMtdFromSessions : counselorTakeFromBank;

  const priorSessions = priorMtdSessionRows.filter((s) => !s.cancelled).length;
  const sessionsDelta = sessionsMtd - priorSessions;
  const priorGross = priorMtdSessionRows
    .filter((s) => !s.noShow && !s.cancelled)
    .reduce((acc, s) => acc + (s.feeCents ?? 0), 0);
  const revenueDelta = mtdRevenueCents - priorGross;

  // Avg sessions per client
  const totalSessionsAcrossClients = clientList.length
    ? await db
        .select({
          v: sql<number>`coalesce(avg(${practiceClients.totalSessions})::numeric, 0)::numeric`,
        })
        .from(practiceClients)
        .where(
          and(
            eq(practiceClients.entityId, entity.id),
            isNotNull(practiceClients.firstSessionAt)
          )
        )
    : [{ v: 0 }];
  const avgSessionsPerClient = Number(totalSessionsAcrossClients[0]?.v ?? 0);

  // ───────── Leak callouts ─────────

  // Inquiries with no reply > 48h: events of any "inquiry" kind, unresolved,
  // occurred > 48h ago.
  const stuckInquiries = unresolvedEvents.filter(
    (e) =>
      e.occurredAt < prior48h &&
      (e.kind === "inquiry_email" ||
        e.kind === "inquiry_sms" ||
        e.kind === "voicemail")
  );

  // Caseload imbalance: any active counselor with caseload > 1.5x median
  const caseloads = leaderboardRaw
    .map((r) => r.activeCaseload)
    .filter((n) => n > 0)
    .sort((a, b) => a - b);
  const medianCaseload =
    caseloads.length === 0
      ? 0
      : caseloads.length % 2
        ? caseloads[(caseloads.length - 1) / 2]
        : (caseloads[caseloads.length / 2 - 1] + caseloads[caseloads.length / 2]) / 2;
  const overloaded = medianCaseload
    ? leaderboardRaw.filter((r) => r.activeCaseload > medianCaseload * 1.5)
    : [];

  // ───────── Counselor leaderboard ─────────
  // Sessions MTD + revenue MTD per counselor + 90-day client retention.

  const mtdByCounselor = new Map<
    string,
    { sessions: number; revenueCents: number; noShow: number }
  >();
  for (const s of mtdSessionRows) {
    if (!s.counselorId) continue;
    const cur = mtdByCounselor.get(s.counselorId) ?? {
      sessions: 0,
      revenueCents: 0,
      noShow: 0,
    };
    if (!s.cancelled) cur.sessions += 1;
    if (s.noShow) cur.noShow += 1;
    if (!s.noShow && !s.cancelled) cur.revenueCents += s.feeCents ?? 0;
    mtdByCounselor.set(s.counselorId, cur);
  }
  // 90-day client retention per counselor:
  //   numerator = clients with a session in last 30d AND a session 60-90d prior
  //   denominator = clients with a session 60-90d prior
  // Computed in JS from cohortClients + recentSessions-by-counselor (need all sessions; do an extra query lazily).
  const allRecentSessionsByCounselor = await db
    .select({
      counselorId: practiceSessions.counselorId,
      clientId: practiceSessions.clientId,
      scheduledFor: practiceSessions.scheduledFor,
      noShow: practiceSessions.noShow,
      cancelled: practiceSessions.cancelled,
    })
    .from(practiceSessions)
    .where(
      and(
        eq(practiceSessions.entityId, entity.id),
        gte(practiceSessions.scheduledFor, ninetyDaysAgo),
        isNotNull(practiceSessions.clientId)
      )
    );

  const retentionByCounselor = new Map<string, number>();
  for (const c of counselorRoster) {
    const sessionsByClient = new Map<string, Date[]>();
    for (const s of allRecentSessionsByCounselor) {
      if (s.counselorId !== c.id) continue;
      if (s.noShow || s.cancelled) continue;
      const cid = s.clientId!;
      const arr = sessionsByClient.get(cid) ?? [];
      arr.push(s.scheduledFor);
      sessionsByClient.set(cid, arr);
    }
    let denom = 0;
    let num = 0;
    for (const [, dates] of sessionsByClient) {
      const had60to90 = dates.some(
        (d) => d >= ninetyDaysAgo && d < sixtyDaysAgo
      );
      const had30 = dates.some((d) => d >= thirtyDaysAgo);
      if (had60to90) {
        denom += 1;
        if (had30) num += 1;
      }
    }
    retentionByCounselor.set(c.id, safePct(num, denom));
  }

  const leaderboard = counselorRoster.map((c) => {
    const display = c.dba ?? c.legalName;
    const lb = leaderboardRaw.find((r) => r.counselorId === c.id);
    const mtd = mtdByCounselor.get(c.id) ?? {
      sessions: 0,
      revenueCents: 0,
      noShow: 0,
    };
    // PtC share at this counselor's keep %. Null keep% → assume 100% to counselor (we don't claim a cut).
    const keep = c.feeKeepPercent ?? null;
    const ptcShareCents =
      keep && keep > 0 && keep < 100
        ? Math.round(mtd.revenueCents * ((100 - keep) / 100))
        : 0;
    return {
      id: c.id,
      display,
      avatarUrl: c.avatarUrl,
      keepPct: keep,
      caseload: lb?.activeCaseload ?? 0,
      sessionsMtd: mtd.sessions,
      revenueCents: mtd.revenueCents,
      ptcShareCents,
      noShow: mtd.noShow,
      avgEngagementMonths: Number(lb?.avgEngagementMonths ?? 0),
      retention90d: retentionByCounselor.get(c.id) ?? 0,
    };
  });
  leaderboard.sort((a, b) => b.revenueCents - a.revenueCents);

  // ───────── Per-counselor retention cohorts ─────────

  const cohortByCounselor = new Map<
    string,
    {
      firstSessionN: number;
      reaching: Record<number, number>;
    }
  >();
  for (const cc of cohortClients) {
    if (!cc.primaryCounselorId) continue;
    const cur = cohortByCounselor.get(cc.primaryCounselorId) ?? {
      firstSessionN: 0,
      reaching: COHORT_MILESTONES.reduce<Record<number, number>>((a, m) => {
        a[m] = 0;
        return a;
      }, {}),
    };
    cur.firstSessionN += 1;
    for (const m of COHORT_MILESTONES) {
      if ((cc.totalSessions ?? 0) >= m) cur.reaching[m] += 1;
    }
    cohortByCounselor.set(cc.primaryCounselorId, cur);
  }

  // ───────── New-client source rollup ─────────

  const totalNewThisMonth = sourceRollup.reduce((s, r) => s + r.n, 0);
  const sourceRows = sourceRollup
    .map((r) => ({
      source: r.source ?? "manual",
      n: r.n,
      pct: safePct(r.n, totalNewThisMonth),
    }))
    .sort((a, b) => b.n - a.n);

  // ───────── Inbox ─────────

  const stuckIds = new Set(stuckInquiries.map((e) => e.id));
  const inboxOther = unresolvedEvents.filter((e) => !stuckIds.has(e.id));

  // ───────── Client + counselor options for forms ─────────

  const counselorOptions: CounselorOption[] = counselorRoster.map((c) => ({
    id: c.id,
    display: c.dba ?? c.legalName,
    feeKeepPercent: c.feeKeepPercent,
  }));
  const clientOptions: ClientOption[] = clientList.map((c) => ({
    id: c.id,
    display: c.preferredFirstName
      ? `${c.displayInitials} (${c.preferredFirstName})`
      : c.displayInitials,
  }));

  // ───────── Helpers ─────────

  function counselorName(id: string | null | undefined): string {
    if (!id) return "—";
    const c = counselorOptions.find((x) => x.id === id);
    return c?.display ?? "—";
  }
  function clientDisplay(id: string | null): string {
    if (!id) return "— unmatched —";
    const c = clientOptions.find((x) => x.id === id);
    return c?.display ?? "—";
  }
  function sourceLabel(s: string | null): string {
    switch (s) {
      case "email_inquiry":
        return "Email";
      case "dialpad_sms":
        return "SMS";
      case "dialpad_voicemail":
        return "Voicemail";
      case "referral":
        return "Referral";
      case "walkin":
        return "Walk-in";
      case "therapynotes":
        return "TherapyNotes";
      case "manual":
        return "Manual";
      default:
        return s ?? "Manual";
    }
  }
  function eventKindLabel(kind: string): string {
    switch (kind) {
      case "inquiry_email":
        return "Email inquiry";
      case "inquiry_sms":
        return "SMS inquiry";
      case "voicemail":
        return "Voicemail";
      case "referral_note":
        return "Referral";
      case "walkin":
        return "Walk-in";
      default:
        return kind;
    }
  }

  // ───────── Render ─────────

  return (
    <Page>
      <PageHeader
        title="Practice"
        subtitle={`Path to Change — operations, counselors, clients.`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <LogSessionButton counselors={counselorOptions} clients={clientOptions} />
            <LogInquiryButton counselors={counselorOptions} />
          </div>
        }
      />

      {/* ───── Leak callouts ───── */}
      {stuckInquiries.length > 0 && (
        <Callout
          title={`${stuckInquiries.length} inquir${stuckInquiries.length === 1 ? "y" : "ies"} with no reply > 48h`}
          tone="warning"
        >
          The longer these sit, the colder they get. Triage from the inbox panel below.
        </Callout>
      )}
      {overloaded.length > 0 && medianCaseload > 0 && (
        <Callout
          title={`Caseload imbalance — ${overloaded.length} counselor${overloaded.length === 1 ? "" : "s"} > 1.5x median (${medianCaseload})`}
          tone="warning"
        >
          {overloaded
            .map(
              (r) =>
                counselorOptions.find((c) => c.id === r.counselorId)?.display ??
                "—"
            )
            .join(", ")}
        </Callout>
      )}

      {/* ───── StatTile strip ───── */}
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile label="Active clients" value={activeClients.toLocaleString()} />
        <StatTile
          label="Sessions MTD"
          value={sessionsMtd.toLocaleString()}
          hint={
            priorSessions > 0
              ? `${sessionsDelta >= 0 ? "+" : ""}${sessionsDelta} vs ${prior.from.getUTCFullYear()}`
              : undefined
          }
          tone={sessionsDelta >= 0 ? "success" : "warning"}
        />
        <StatTile
          label="No-show %"
          value={`${noShowPct.toFixed(1)}%`}
          tone={noShowPct > 15 ? "warning" : "neutral"}
        />
        <StatTile
          label="Avg sessions / client"
          value={avgSessionsPerClient.toFixed(1)}
        />
        <StatTile
          label="MTD revenue"
          value={<Money cents={mtdRevenueCents} />}
          hint={
            priorGross > 0
              ? `${revenueDelta >= 0 ? "+" : ""}$${(Math.abs(revenueDelta) / 100).toLocaleString()} vs ${prior.from.getUTCFullYear()}`
              : grossMtdFromSessions === 0 && counselorTakeFromBank > 0
                ? "From bank ledger (sessions have no fees yet)"
                : undefined
          }
          tone={revenueDelta >= 0 ? "success" : "warning"}
        />
        <StatTile
          label="Awaiting first session"
          value={awaitingFirst.toLocaleString()}
          tone={awaitingFirst > 0 ? "warning" : "neutral"}
        />
      </div>

      {/* ───── Counselor leaderboard ───── */}
      <section>
        <SectionHeader title="Counselor leaderboard" />
        {leaderboard.length === 0 ? (
          <EmptyState
            title="No counselors on this entity"
            description="Add contractors at /contractors first."
          />
        ) : (
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-left text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">
                    <th className="px-5 py-3 font-semibold">Counselor</th>
                    <th className="px-5 py-3 font-semibold text-right whitespace-nowrap">
                      Active caseload
                    </th>
                    <th className="px-5 py-3 font-semibold text-right whitespace-nowrap">
                      Sessions MTD
                    </th>
                    <th className="px-5 py-3 font-semibold text-right whitespace-nowrap">
                      Revenue MTD
                    </th>
                    <th className="px-5 py-3 font-semibold text-right whitespace-nowrap">
                      PTC share
                    </th>
                    <th className="px-5 py-3 font-semibold text-right whitespace-nowrap">
                      Avg engagement (mo)
                    </th>
                    <th className="px-5 py-3 font-semibold text-right whitespace-nowrap">
                      90d retention
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.map((r) => (
                    <tr
                      key={r.id}
                      className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface-warm)] transition-colors"
                    >
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <Avatar src={r.avatarUrl} name={r.display} size={36} />
                          <div>
                            <Link
                              href={`/contractors/${r.id}`}
                              className="font-medium hover:underline"
                            >
                              {r.display}
                            </Link>
                            {r.keepPct != null && (
                              <div className="text-xs text-[var(--muted)]">
                                Keeps {r.keepPct}%
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-right tabular whitespace-nowrap">
                        {r.caseload}
                      </td>
                      <td className="px-5 py-3.5 text-right tabular whitespace-nowrap">
                        {r.sessionsMtd}
                      </td>
                      <td className="px-5 py-3.5 text-right tabular whitespace-nowrap font-semibold">
                        <Money cents={r.revenueCents} />
                      </td>
                      <td className="px-5 py-3.5 text-right tabular whitespace-nowrap text-[var(--muted)]">
                        <Money cents={r.ptcShareCents} />
                      </td>
                      <td className="px-5 py-3.5 text-right tabular whitespace-nowrap">
                        {r.avgEngagementMonths > 0
                          ? r.avgEngagementMonths.toFixed(1)
                          : "—"}
                      </td>
                      <td className="px-5 py-3.5 text-right tabular whitespace-nowrap">
                        {r.retention90d ? `${r.retention90d.toFixed(0)}%` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </section>

      {/* ───── Where new clients came from ───── */}
      <section>
        <SectionHeader
          title="New clients this month"
          hint={
            <span className="text-xs text-[var(--muted)]">
              {totalNewThisMonth} total
            </span>
          }
        />
        {sourceRows.length === 0 ? (
          <EmptyState
            title="No new clients yet this month"
            description="Source attribution fills in once you log inquiries or run the TherapyNotes import."
          />
        ) : (
          <Card>
            <ul className="divide-y divide-[var(--border)] text-sm">
              {sourceRows.map((r) => (
                <li
                  key={r.source}
                  className="flex items-baseline justify-between gap-3 px-5 py-3"
                >
                  <span className="font-medium">{sourceLabel(r.source)}</span>
                  <span className="text-[var(--muted)] text-xs tabular">
                    {r.n} · {r.pct.toFixed(0)}%
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>

      {/* ───── Inbox / triage ───── */}
      <section>
        <SectionHeader
          title="Inbox"
          hint={
            <span className="text-xs text-[var(--muted)]">
              {unresolvedEvents.length} unresolved
            </span>
          }
        />
        {unresolvedEvents.length === 0 ? (
          <EmptyState
            title="Inbox zero"
            description="When inquiries flow in from email, SMS, or voicemail, they'll land here for you to resolve to a client."
          />
        ) : (
          <Card>
            <ul className="divide-y divide-[var(--border)] text-sm">
              {[...stuckInquiries, ...inboxOther].map((e) => {
                const summary = `${eventKindLabel(e.kind)} · ${e.occurredAt.toISOString().slice(0, 10)}${
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  (e.payload as any)?.snippet
                    ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      ` — ${String((e.payload as any).snippet).slice(0, 120)}`
                    : ""
                }`;
                return (
                  <li key={e.id} className="px-5 py-3">
                    <ResolveEventRow
                      eventId={e.id}
                      clients={clientOptions}
                      counselors={counselorOptions}
                      summary={summary}
                    />
                  </li>
                );
              })}
            </ul>
          </Card>
        )}
      </section>

      {/* ───── Per-counselor retention cohorts ───── */}
      <section>
        <SectionHeader title="Client retention by counselor" />
        {cohortByCounselor.size === 0 ? (
          <EmptyState
            title="No completed sessions yet"
            description="Cohort retention populates once first sessions are logged."
          />
        ) : (
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-left text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">
                    <th className="px-5 py-3 font-semibold">Counselor</th>
                    <th className="px-5 py-3 font-semibold text-right whitespace-nowrap">
                      Clients w/ 1st session
                    </th>
                    {COHORT_MILESTONES.slice(1).map((m) => (
                      <th
                        key={m}
                        className="px-3 py-3 font-semibold text-right whitespace-nowrap"
                      >
                        ≥ {m}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...cohortByCounselor.entries()]
                    .sort(([, a], [, b]) => b.firstSessionN - a.firstSessionN)
                    .map(([cid, c]) => (
                      <tr
                        key={cid}
                        className="border-b border-[var(--border)] last:border-0"
                      >
                        <td className="px-5 py-3.5">
                          <Link
                            href={`/contractors/${cid}`}
                            className="font-medium hover:underline"
                          >
                            {counselorName(cid)}
                          </Link>
                        </td>
                        <td className="px-5 py-3.5 text-right tabular whitespace-nowrap font-semibold">
                          {c.firstSessionN}
                        </td>
                        {COHORT_MILESTONES.slice(1).map((m) => {
                          const pct = safePct(c.reaching[m] ?? 0, c.firstSessionN);
                          return (
                            <td
                              key={m}
                              className="px-3 py-3.5 text-right tabular whitespace-nowrap text-[var(--muted)]"
                            >
                              {c.reaching[m] ?? 0}
                              <span className="text-[10px] ml-1 text-[var(--muted)]">
                                ({pct.toFixed(0)}%)
                              </span>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </section>

      {/* ───── Recent sessions ───── */}
      <section>
        <SectionHeader title="Recent sessions" />
        {recentSessions.length === 0 ? (
          <EmptyState
            title="No sessions logged yet"
            description="Click + Log session above or run the TherapyNotes import."
          />
        ) : (
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-left text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">
                    <th className="px-5 py-3 font-semibold whitespace-nowrap">
                      Date
                    </th>
                    <th className="px-5 py-3 font-semibold">Client</th>
                    <th className="px-5 py-3 font-semibold">Counselor</th>
                    <th className="px-5 py-3 font-semibold text-right whitespace-nowrap">
                      Fee
                    </th>
                    <th className="px-5 py-3 font-semibold whitespace-nowrap">Flags</th>
                  </tr>
                </thead>
                <tbody>
                  {recentSessions.map((s) => (
                    <tr
                      key={s.id}
                      className="border-b border-[var(--border)] last:border-0"
                    >
                      <td className="px-5 py-3.5 tabular whitespace-nowrap text-[var(--muted)]">
                        {s.scheduledFor.toISOString().slice(0, 10)}
                      </td>
                      <td className="px-5 py-3.5">
                        {s.clientId ? (
                          <span className="font-medium">
                            {clientDisplay(s.clientId)}
                          </span>
                        ) : (
                          <span className="text-[var(--muted)] italic">
                            unmatched
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        <Link
                          href={`/contractors/${s.counselorId}`}
                          className="hover:underline"
                        >
                          {counselorName(s.counselorId)}
                        </Link>
                      </td>
                      <td className="px-5 py-3.5 text-right tabular whitespace-nowrap">
                        {s.feeCents != null ? <Money cents={s.feeCents} /> : "—"}
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <SessionFlagButtons
                            sessionId={s.id}
                            noShow={s.noShow}
                            cancelled={s.cancelled}
                          />
                          {s.completedAt && !s.noShow && !s.cancelled && (
                            <StatusPill tone="success">Held</StatusPill>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </section>

      <p className="text-[10px] text-[var(--muted)] italic">
        PHI scope: initials + counselor link + session dates + fees only. No
        clinical content. Every page load writes a phi_read audit row.
      </p>
    </Page>
  );
}
