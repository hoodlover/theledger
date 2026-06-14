import Link from "next/link";
import { db } from "@/lib/db";
import {
  entities,
  contractors,
  practiceSessions,
  practiceClients,
} from "@/lib/db/schema";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import {
  Page,
  PageHeader,
  EmptyState,
  Card,
  StatusPill,
} from "@/components/ui";
import { logPhiRead } from "@/lib/audit";

export const dynamic = "force-dynamic";

type SP = Promise<{ week?: string }>;

const DAY_LABEL = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function startOfWeekUTC(d: Date): Date {
  // Snap to Sunday 00:00 UTC
  const out = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  );
  out.setUTCDate(out.getUTCDate() - out.getUTCDay());
  return out;
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default async function CalendarPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;

  const today = new Date();
  const anchorDay = sp.week ? new Date(`${sp.week}T00:00:00Z`) : today;
  const weekStart = startOfWeekUTC(
    Number.isNaN(anchorDay.getTime()) ? today : anchorDay
  );
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);

  const prevWeek = new Date(weekStart);
  prevWeek.setUTCDate(prevWeek.getUTCDate() - 7);
  const nextWeek = new Date(weekStart);
  nextWeek.setUTCDate(nextWeek.getUTCDate() + 7);

  const [entity] = await db
    .select({ id: entities.id })
    .from(entities)
    .where(eq(entities.slug, "path-to-change"));
  if (!entity) {
    return (
      <Page>
        <PageHeader title="Calendar" />
        <EmptyState
          title="Path to Change entity not found"
          description="Seed it via npm run db:seed first."
        />
      </Page>
    );
  }

  const [sessions, counselorRoster, clientRoster] = await Promise.all([
    db
      .select({
        id: practiceSessions.id,
        scheduledFor: practiceSessions.scheduledFor,
        counselorId: practiceSessions.counselorId,
        clientId: practiceSessions.clientId,
        durationMinutes: practiceSessions.id, // placeholder; not used yet
        noShow: practiceSessions.noShow,
        cancelled: practiceSessions.cancelled,
        completedAt: practiceSessions.completedAt,
      })
      .from(practiceSessions)
      .where(
        and(
          eq(practiceSessions.entityId, entity.id),
          gte(practiceSessions.scheduledFor, weekStart),
          lte(practiceSessions.scheduledFor, weekEnd)
        )
      )
      .orderBy(asc(practiceSessions.scheduledFor)),
    db
      .select({
        id: contractors.id,
        legalName: contractors.legalName,
        dba: contractors.dba,
      })
      .from(contractors)
      .where(
        and(
          eq(contractors.entityId, entity.id),
          eq(contractors.isCounselor, true)
        )
      )
      .orderBy(asc(contractors.legalName)),
    db
      .select({
        id: practiceClients.id,
        displayInitials: practiceClients.displayInitials,
        preferredFirstName: practiceClients.preferredFirstName,
      })
      .from(practiceClients)
      .where(eq(practiceClients.entityId, entity.id)),
  ]);

  await logPhiRead({
    context: "/practice/calendar",
    count: sessions.filter((s) => s.clientId).length,
  });

  const counselorMap = new Map(
    counselorRoster.map((c) => [c.id, c.dba ?? c.legalName])
  );
  const clientMap = new Map(
    clientRoster.map((c) => [
      c.id,
      c.preferredFirstName
        ? `${c.displayInitials} (${c.preferredFirstName})`
        : c.displayInitials,
    ])
  );

  // Bucket sessions per (counselor, dayOfWeek 0-6)
  type Slot = {
    id: string;
    time: string; // HH:MM
    clientId: string | null;
    noShow: boolean;
    cancelled: boolean;
    held: boolean;
  };
  const grid = new Map<string, Map<number, Slot[]>>();
  for (const c of counselorRoster) grid.set(c.id, new Map());
  for (const s of sessions) {
    if (!s.counselorId) continue;
    const day = s.scheduledFor.getUTCDay();
    const m = grid.get(s.counselorId);
    if (!m) continue;
    const arr = m.get(day) ?? [];
    arr.push({
      id: s.id,
      time: s.scheduledFor.toISOString().slice(11, 16),
      clientId: s.clientId,
      noShow: s.noShow,
      cancelled: s.cancelled,
      held: !!s.completedAt && !s.noShow && !s.cancelled,
    });
    m.set(day, arr);
  }

  const weekDays: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setUTCDate(d.getUTCDate() + i);
    weekDays.push(d);
  }
  const todayIso = isoDay(today);

  // Hide rows that have zero sessions all week to keep the grid compact
  const visibleCounselors = counselorRoster.filter((c) => {
    const m = grid.get(c.id);
    if (!m) return false;
    return [...m.values()].some((arr) => arr.length > 0);
  });

  return (
    <Page>
      <PageHeader
        title="Week calendar"
        subtitle={`${isoDay(weekStart)} → ${isoDay(new Date(weekEnd.getTime() - 86400000))}`}
        actions={
          <div className="flex items-center gap-2">
            <Link
              href={`/practice/calendar?week=${isoDay(prevWeek)}`}
              className="rounded-full border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface-warm)] transition-colors"
            >
              ← Prev
            </Link>
            <Link
              href={`/practice/calendar`}
              className="rounded-full border border-[var(--border)] px-3 py-1.5 text-xs"
            >
              This week
            </Link>
            <Link
              href={`/practice/calendar?week=${isoDay(nextWeek)}`}
              className="rounded-full border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface-warm)] transition-colors"
            >
              Next →
            </Link>
          </div>
        }
      />

      {sessions.length === 0 ? (
        <EmptyState
          title="No sessions this week"
          description="Run materialize-standing on a /api/cron/practice-materialize, log a session manually, or add a standing slot on a client."
        />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">
                  <th className="px-4 py-3 font-semibold sticky left-0 bg-white">
                    Counselor
                  </th>
                  {weekDays.map((d, i) => {
                    const iso = isoDay(d);
                    const isToday = iso === todayIso;
                    return (
                      <th
                        key={i}
                        className={[
                          "px-2 py-3 font-semibold text-left min-w-[120px]",
                          isToday ? "bg-[var(--color-sage-tint,#e8efe9)]" : "",
                        ].join(" ")}
                      >
                        <div>{DAY_LABEL[i]}</div>
                        <div className="text-[10px] tabular text-[var(--muted)] mt-0.5">
                          {iso.slice(5)}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {visibleCounselors.map((c) => {
                  const m = grid.get(c.id) ?? new Map<number, Slot[]>();
                  return (
                    <tr
                      key={c.id}
                      className="border-b border-[var(--border)] last:border-0"
                    >
                      <td className="px-4 py-2 sticky left-0 bg-white align-top">
                        <Link
                          href={`/contractors/${c.id}`}
                          className="font-semibold hover:underline"
                        >
                          {c.dba ?? c.legalName}
                        </Link>
                      </td>
                      {weekDays.map((d, i) => {
                        const slots = m.get(i) ?? [];
                        const iso = isoDay(d);
                        const isToday = iso === todayIso;
                        return (
                          <td
                            key={i}
                            className={[
                              "px-2 py-2 align-top",
                              isToday ? "bg-[var(--color-sage-tint,#e8efe9)]/30" : "",
                            ].join(" ")}
                          >
                            <div className="space-y-1">
                              {slots
                                .sort((a, b) => a.time.localeCompare(b.time))
                                .map((s) => (
                                  <div
                                    key={s.id}
                                    className={[
                                      "rounded-md border px-1.5 py-1 leading-tight",
                                      s.noShow
                                        ? "border-[#ebcacb] bg-[#f5e8e9] text-[#8b3a3f]"
                                        : s.cancelled
                                          ? "border-[var(--border)] bg-[var(--surface-warm)] text-[var(--muted)] line-through"
                                          : s.held
                                            ? "border-[#cfe0d2] bg-[#eff5f0] text-[#3a5a40]"
                                            : "border-[var(--border)] bg-white",
                                    ].join(" ")}
                                  >
                                    <div className="font-semibold tabular text-[10px]">
                                      {s.time}
                                    </div>
                                    {s.clientId ? (
                                      <Link
                                        href={`/practice/clients/${s.clientId}`}
                                        className="text-[11px] hover:underline truncate block"
                                      >
                                        {clientMap.get(s.clientId) ?? "—"}
                                      </Link>
                                    ) : (
                                      <span className="text-[10px] italic text-[var(--muted)]">
                                        unmatched
                                      </span>
                                    )}
                                  </div>
                                ))}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="border-t border-[var(--border)] px-4 py-2 text-[10px] text-[var(--muted)] flex flex-wrap gap-3">
            <span className="inline-flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded-sm border border-[var(--border)] bg-white" />
              upcoming
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded-sm border border-[#cfe0d2] bg-[#eff5f0]" />
              held
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded-sm border border-[#ebcacb] bg-[#f5e8e9]" />
              no-show
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded-sm border border-[var(--border)] bg-[var(--surface-warm)]" />
              cancelled
            </span>
          </div>
        </Card>
      )}

      <p className="text-[10px] text-[var(--muted)] italic">
        PHI: initials only. Read writes a phi_read audit row.
      </p>
    </Page>
  );
}
