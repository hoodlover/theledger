import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import {
  entities,
  practiceClients,
  practiceClientCounselors,
  practiceSessions,
  practiceNotes,
  practiceStatusHistory,
  practiceTasks,
  practiceStandingSchedules,
  practiceClientDocuments,
  contractors,
  users,
  type PracticeClientStatus,
} from "@/lib/db/schema";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import {
  Page,
  PageHeader,
  Card,
  SectionHeader,
  EmptyState,
  Money,
  StatusPill,
} from "@/components/ui";
import {
  StatusSelect,
  CounselorReassignSelect,
  NoteComposer,
  StandingScheduleBox,
  ClientDocumentsBox,
  TagEditor,
} from "./_client";
import { logPhiRead } from "@/lib/audit";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<PracticeClientStatus, string> = {
  lead: "Lead",
  scheduling: "Scheduling",
  confirmed: "Confirmed",
  in_progress: "In progress",
  discharged: "Discharged",
  lost: "Lost",
};

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [client] = await db
    .select()
    .from(practiceClients)
    .where(eq(practiceClients.id, id));
  if (!client) notFound();

  await logPhiRead({
    resourceId: id,
    count: 1,
    context: "/practice/clients/[id]",
  });

  const [entity] = await db
    .select({ id: entities.id, slug: entities.slug, name: entities.name })
    .from(entities)
    .where(eq(entities.id, client.entityId));

  const [
    counselorRoster,
    counselorHistoryRows,
    sessionRows,
    noteRows,
    statusRows,
    taskRows,
    standingRows,
    docRows,
  ] = await Promise.all([
    db
      .select({
        id: contractors.id,
        legalName: contractors.legalName,
        dba: contractors.dba,
      })
      .from(contractors)
      .where(eq(contractors.entityId, client.entityId))
      .orderBy(asc(contractors.legalName)),
    db
      .select({
        counselorId: practiceClientCounselors.counselorId,
        startedAt: practiceClientCounselors.startedAt,
        endedAt: practiceClientCounselors.endedAt,
      })
      .from(practiceClientCounselors)
      .where(eq(practiceClientCounselors.clientId, id))
      .orderBy(desc(practiceClientCounselors.startedAt)),
    db
      .select({
        id: practiceSessions.id,
        scheduledFor: practiceSessions.scheduledFor,
        completedAt: practiceSessions.completedAt,
        noShow: practiceSessions.noShow,
        cancelled: practiceSessions.cancelled,
        feeCents: practiceSessions.feeCents,
        counselorId: practiceSessions.counselorId,
      })
      .from(practiceSessions)
      .where(eq(practiceSessions.clientId, id))
      .orderBy(desc(practiceSessions.scheduledFor))
      .limit(50),
    db
      .select({
        id: practiceNotes.id,
        body: practiceNotes.body,
        authorUserId: practiceNotes.authorUserId,
        createdAt: practiceNotes.createdAt,
      })
      .from(practiceNotes)
      .where(eq(practiceNotes.clientId, id))
      .orderBy(desc(practiceNotes.createdAt)),
    db
      .select({
        id: practiceStatusHistory.id,
        fromStatus: practiceStatusHistory.fromStatus,
        toStatus: practiceStatusHistory.toStatus,
        changedAt: practiceStatusHistory.changedAt,
        changedByUserId: practiceStatusHistory.changedByUserId,
      })
      .from(practiceStatusHistory)
      .where(eq(practiceStatusHistory.clientId, id))
      .orderBy(desc(practiceStatusHistory.changedAt))
      .limit(20),
    db
      .select({
        id: practiceTasks.id,
        title: practiceTasks.title,
        status: practiceTasks.status,
        dueAt: practiceTasks.dueAt,
        assignedToUserId: practiceTasks.assignedToUserId,
      })
      .from(practiceTasks)
      .where(eq(practiceTasks.clientId, id))
      .orderBy(desc(practiceTasks.createdAt))
      .limit(20),
    db
      .select({
        id: practiceStandingSchedules.id,
        counselorId: practiceStandingSchedules.counselorId,
        dayOfWeek: practiceStandingSchedules.dayOfWeek,
        timeOfDay: practiceStandingSchedules.timeOfDay,
        durationMinutes: practiceStandingSchedules.durationMinutes,
        weeksInterval: practiceStandingSchedules.weeksInterval,
        startedOn: practiceStandingSchedules.startedOn,
        feeCents: practiceStandingSchedules.feeCents,
      })
      .from(practiceStandingSchedules)
      .where(
        and(
          eq(practiceStandingSchedules.clientId, id),
          isNull(practiceStandingSchedules.endedOn)
        )
      )
      .orderBy(asc(practiceStandingSchedules.dayOfWeek)),
    db
      .select({
        id: practiceClientDocuments.id,
        kind: practiceClientDocuments.kind,
        displayName: practiceClientDocuments.displayName,
        blobUrl: practiceClientDocuments.blobUrl,
        createdAt: practiceClientDocuments.createdAt,
      })
      .from(practiceClientDocuments)
      .where(eq(practiceClientDocuments.clientId, id))
      .orderBy(desc(practiceClientDocuments.createdAt)),
  ]);

  const userRows = await db
    .select({ id: users.id, name: users.name })
    .from(users);
  const userName = (uid: string | null) =>
    uid ? (userRows.find((u) => u.id === uid)?.name ?? "—") : "—";
  const counselorName = (cid: string | null) => {
    if (!cid) return "—";
    const c = counselorRoster.find((c) => c.id === cid);
    return c?.dba ?? c?.legalName ?? "—";
  };

  const display = client.preferredFirstName
    ? `${client.displayInitials} (${client.preferredFirstName})`
    : client.displayInitials;
  const status = (client.status as PracticeClientStatus) ?? "lead";

  return (
    <Page>
      <PageHeader
        title={display}
        subtitle={
          <>
            {entity?.name && (
              <>
                <Link href={`/entities/${entity.slug}`} className="hover:underline">
                  {entity.name}
                </Link>{" "}
                · {STATUS_LABEL[status]}
              </>
            )}
          </>
        }
        actions={
          <div className="flex items-center gap-2">
            <StatusSelect clientId={client.id} current={status} />
            <Link
              href="/practice/board"
              className="rounded-full border border-[var(--border)] px-4 py-1.5 text-sm text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface-warm)] transition-colors"
            >
              Board
            </Link>
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          {/* ───── Notes thread ───── */}
          <section>
            <SectionHeader title="Notes" />
            <Card className="p-5 space-y-4">
              <NoteComposer entityId={client.entityId} clientId={client.id} />
              {noteRows.length === 0 ? (
                <p className="text-xs text-[var(--muted)] italic">No notes yet.</p>
              ) : (
                <ul className="divide-y divide-[var(--border)]">
                  {noteRows.map((n) => (
                    <li key={n.id} className="py-3">
                      <div className="flex items-baseline justify-between gap-2 mb-1">
                        <span className="text-xs font-semibold">
                          {userName(n.authorUserId)}
                        </span>
                        <span className="text-[10px] text-[var(--muted)] tabular">
                          {n.createdAt.toISOString().slice(0, 16).replace("T", " ")}
                        </span>
                      </div>
                      <div className="text-sm whitespace-pre-wrap">{n.body}</div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </section>

          {/* ───── Tasks ───── */}
          <section>
            <SectionHeader
              title="Tasks"
              hint={
                <Link href="/practice/tasks" className="text-xs text-[var(--accent)] hover:underline">
                  All tasks →
                </Link>
              }
            />
            {taskRows.length === 0 ? (
              <EmptyState
                title="No tasks for this client"
                description="Create one on /practice/tasks and pick this client."
              />
            ) : (
              <Card>
                <ul className="divide-y divide-[var(--border)] text-sm">
                  {taskRows.map((t) => (
                    <li key={t.id} className="px-5 py-3 flex items-baseline justify-between gap-3">
                      <span>{t.title}</span>
                      <div className="flex items-center gap-2 text-xs">
                        {t.dueAt && (
                          <span className="text-[var(--muted)] tabular">
                            {t.dueAt.toISOString().slice(0, 10)}
                          </span>
                        )}
                        <StatusPill
                          tone={
                            t.status === "done"
                              ? "success"
                              : t.status === "open"
                                ? "warning"
                                : "neutral"
                          }
                        >
                          {t.status}
                        </StatusPill>
                      </div>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </section>

          {/* ───── Sessions ───── */}
          <section>
            <SectionHeader title="Sessions" />
            {sessionRows.length === 0 ? (
              <EmptyState
                title="No sessions yet"
                description="Log sessions on /practice or wait for TherapyNotes import."
              />
            ) : (
              <Card>
                <ul className="divide-y divide-[var(--border)] text-sm">
                  {sessionRows.map((s) => (
                    <li
                      key={s.id}
                      className="px-5 py-3 flex items-baseline justify-between gap-3"
                    >
                      <div>
                        <span className="tabular text-[var(--muted)] text-xs">
                          {s.scheduledFor.toISOString().slice(0, 10)}
                        </span>
                        <span className="ml-3 text-xs">
                          {counselorName(s.counselorId)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {s.feeCents != null && (
                          <span className="text-xs tabular">
                            <Money cents={s.feeCents} />
                          </span>
                        )}
                        {s.noShow && (
                          <StatusPill tone="danger">No-show</StatusPill>
                        )}
                        {s.cancelled && (
                          <StatusPill tone="neutral">Cancelled</StatusPill>
                        )}
                        {s.completedAt && !s.noShow && !s.cancelled && (
                          <StatusPill tone="success">Held</StatusPill>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </section>
        </div>

        {/* ───── Sidebar ───── */}
        <aside className="space-y-6 lg:sticky lg:top-24 h-fit">
          <section>
            <SectionHeader title="Counselor" />
            <Card className="p-5 space-y-3">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                  Currently
                </div>
                <div className="font-medium mt-1">
                  {counselorName(client.primaryCounselorId)}
                </div>
              </div>
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)] mb-1">
                  Reassign
                </div>
                <CounselorReassignSelect
                  clientId={client.id}
                  current={client.primaryCounselorId}
                  counselors={counselorRoster.map((c) => ({
                    id: c.id,
                    display: c.dba ?? c.legalName,
                  }))}
                />
              </div>
              {counselorHistoryRows.length > 1 && (
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)] mb-1">
                    History
                  </div>
                  <ul className="text-xs space-y-1">
                    {counselorHistoryRows.map((h, i) => (
                      <li key={i} className="text-[var(--muted)] tabular">
                        {counselorName(h.counselorId)} ·{" "}
                        {h.startedAt.toISOString().slice(0, 10)}
                        {h.endedAt
                          ? ` → ${h.endedAt.toISOString().slice(0, 10)}`
                          : " → present"}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>
          </section>

          <section>
            <SectionHeader title="Tags" />
            <Card className="p-4">
              <TagEditor
                clientId={client.id}
                initialTags={client.tags ?? []}
              />
            </Card>
          </section>

          <section>
            <SectionHeader title="Documents" />
            <Card className="p-4">
              <ClientDocumentsBox
                clientId={client.id}
                items={docRows.map((d) => ({
                  id: d.id,
                  kind: d.kind,
                  displayName: d.displayName,
                  blobUrl: d.blobUrl,
                  createdAt: d.createdAt.toISOString(),
                }))}
              />
            </Card>
          </section>

          <section>
            <SectionHeader title="Standing schedule" />
            <Card className="p-4">
              <StandingScheduleBox
                entityId={client.entityId}
                clientId={client.id}
                counselors={counselorRoster.map((c) => ({
                  id: c.id,
                  display: c.dba ?? c.legalName,
                }))}
                schedules={standingRows.map((s) => ({
                  id: s.id,
                  counselorId: s.counselorId,
                  counselorName: counselorName(s.counselorId),
                  dayOfWeek: s.dayOfWeek,
                  timeOfDay: s.timeOfDay,
                  durationMinutes: s.durationMinutes,
                  weeksInterval: s.weeksInterval,
                  startedOn: s.startedOn,
                  feeCents: s.feeCents,
                }))}
              />
            </Card>
          </section>

          <section>
            <SectionHeader title="Status history" />
            <Card className="p-4">
              {statusRows.length === 0 ? (
                <p className="text-xs text-[var(--muted)] italic">
                  No status changes yet.
                </p>
              ) : (
                <ul className="text-xs space-y-2">
                  {statusRows.map((r) => (
                    <li key={r.id} className="tabular">
                      <span className="text-[var(--muted)]">
                        {r.changedAt.toISOString().slice(0, 16).replace("T", " ")}
                      </span>{" "}
                      <span>
                        {r.fromStatus ?? "—"} →{" "}
                        <strong>{r.toStatus}</strong>
                      </span>
                      <div className="text-[10px] text-[var(--muted)]">
                        by {userName(r.changedByUserId)}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </section>

          <section>
            <SectionHeader title="Key dates" />
            <Card className="p-4 text-xs space-y-2 tabular">
              <Row label="First contact" v={client.firstContactAt} />
              <Row label="First scheduled" v={client.firstScheduledAt} />
              <Row label="First session" v={client.firstSessionAt} />
              <Row label="Last session" v={client.lastSessionAt} />
              <Row label="Created" v={client.createdAt} />
              <div className="flex justify-between pt-2 border-t border-[var(--border)]">
                <span className="text-[var(--muted)]">Total sessions</span>
                <span className="font-semibold">{client.totalSessions}</span>
              </div>
            </Card>
          </section>
        </aside>
      </div>

      <p className="text-[10px] text-[var(--muted)] italic">
        PHI: initials + dates only. No clinical content. Every load writes a
        phi_read audit row.
      </p>
    </Page>
  );
}

function Row({ label, v }: { label: string; v: Date | null }) {
  return (
    <div className="flex justify-between">
      <span className="text-[var(--muted)]">{label}</span>
      <span>{v ? v.toISOString().slice(0, 10) : "—"}</span>
    </div>
  );
}
