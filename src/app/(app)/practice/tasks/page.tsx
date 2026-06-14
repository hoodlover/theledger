import Link from "next/link";
import { db } from "@/lib/db";
import {
  entities,
  practiceClients,
  practiceTasks,
  users,
} from "@/lib/db/schema";
import { and, asc, desc, eq, ne, or, sql } from "drizzle-orm";
import {
  Page,
  PageHeader,
  Card,
  EmptyState,
  StatTile,
} from "@/components/ui";
import { NewTaskButton, TaskRowActions } from "./_client";
import { getCurrentUser } from "@/lib/current-user";

export const dynamic = "force-dynamic";

type SP = Promise<{ tab?: string }>;

export default async function TasksPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const tab = sp.tab === "all" ? "all" : "mine";
  const me = await getCurrentUser();

  const [entity] = await db
    .select({ id: entities.id })
    .from(entities)
    .where(eq(entities.slug, "path-to-change"));
  if (!entity || !me) {
    return (
      <Page>
        <PageHeader title="Tasks" />
        <EmptyState
          title="Not available"
          description="Sign in and seed the Path to Change entity first."
        />
      </Page>
    );
  }

  const [usersRows, clientsRows, openCount, mineCount] = await Promise.all([
    db.select({ id: users.id, name: users.name }).from(users).orderBy(asc(users.name)),
    db
      .select({
        id: practiceClients.id,
        displayInitials: practiceClients.displayInitials,
        preferredFirstName: practiceClients.preferredFirstName,
      })
      .from(practiceClients)
      .where(eq(practiceClients.entityId, entity.id))
      .orderBy(asc(practiceClients.displayInitials)),
    db
      .select({ v: sql<number>`count(*)::int` })
      .from(practiceTasks)
      .where(
        and(
          eq(practiceTasks.entityId, entity.id),
          ne(practiceTasks.status, "done"),
          ne(practiceTasks.status, "wont_do")
        )
      ),
    db
      .select({ v: sql<number>`count(*)::int` })
      .from(practiceTasks)
      .where(
        and(
          eq(practiceTasks.entityId, entity.id),
          eq(practiceTasks.assignedToUserId, me.id),
          ne(practiceTasks.status, "done"),
          ne(practiceTasks.status, "wont_do")
        )
      ),
  ]);

  const whereClause =
    tab === "mine"
      ? and(
          eq(practiceTasks.entityId, entity.id),
          eq(practiceTasks.assignedToUserId, me.id),
          or(
            ne(practiceTasks.status, "done"),
            ne(practiceTasks.status, "wont_do")
          )
        )
      : eq(practiceTasks.entityId, entity.id);

  const taskRows = await db
    .select({
      id: practiceTasks.id,
      title: practiceTasks.title,
      body: practiceTasks.body,
      status: practiceTasks.status,
      priority: practiceTasks.priority,
      dueAt: practiceTasks.dueAt,
      assignedToUserId: practiceTasks.assignedToUserId,
      clientId: practiceTasks.clientId,
      createdByUserId: practiceTasks.createdByUserId,
    })
    .from(practiceTasks)
    .where(whereClause!)
    .orderBy(
      sql`case when ${practiceTasks.status} in ('done','wont_do') then 1 else 0 end`,
      sql`${practiceTasks.dueAt} nulls last`,
      desc(practiceTasks.createdAt)
    );

  const clientMap = new Map(
    clientsRows.map((c) => [
      c.id,
      c.preferredFirstName
        ? `${c.displayInitials} (${c.preferredFirstName})`
        : c.displayInitials,
    ])
  );
  const userMap = new Map(usersRows.map((u) => [u.id, u.name]));

  const rows = taskRows.map((t) => ({
    id: t.id,
    title: t.title,
    body: t.body,
    status: t.status,
    priority: t.priority,
    dueAt: t.dueAt ? t.dueAt.toISOString() : null,
    assignedToUserId: t.assignedToUserId,
    assignedToName: t.assignedToUserId ? (userMap.get(t.assignedToUserId) ?? null) : null,
    clientId: t.clientId,
    clientDisplay: t.clientId ? (clientMap.get(t.clientId) ?? null) : null,
    createdByName: t.createdByUserId ? (userMap.get(t.createdByUserId) ?? null) : null,
  }));

  return (
    <Page>
      <PageHeader
        title="Tasks"
        subtitle="Inter-staff to-dos. Replaces Monday.com items."
        actions={
          <NewTaskButton
            entityId={entity.id}
            users={usersRows}
            clients={clientsRows.map((c) => ({
              id: c.id,
              display: c.preferredFirstName
                ? `${c.displayInitials} (${c.preferredFirstName})`
                : c.displayInitials,
            }))}
          />
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile label="Open total" value={openCount[0]?.v ?? 0} />
        <StatTile
          label="Assigned to me"
          value={mineCount[0]?.v ?? 0}
          tone={(mineCount[0]?.v ?? 0) > 0 ? "warning" : "neutral"}
        />
        <StatTile label="Showing" value={rows.length} />
      </div>

      <div className="inline-flex rounded-full border border-[var(--border)] bg-[var(--surface-warm)] p-0.5 text-xs">
        {(
          [
            { id: "mine", label: "Assigned to me" },
            { id: "all", label: "All" },
          ] as const
        ).map((t) => {
          const active = tab === t.id;
          return (
            <Link
              key={t.id}
              href={`/practice/tasks${t.id === "all" ? "?tab=all" : ""}`}
              data-no-lift
              className={[
                "rounded-full px-3 py-1.5",
                active
                  ? "bg-[var(--foreground)] text-white font-semibold"
                  : "text-[var(--body)] hover:text-[var(--foreground)]",
              ].join(" ")}
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="Inbox zero"
          description="When tasks are created or assigned to you they'll show up here."
        />
      ) : (
        <Card>
          <ul className="divide-y divide-[var(--border)]">
            {rows.map((t) => (
              <TaskRowActions key={t.id} task={t} users={usersRows} />
            ))}
          </ul>
        </Card>
      )}
    </Page>
  );
}
