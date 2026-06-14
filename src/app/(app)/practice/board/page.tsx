import { db } from "@/lib/db";
import {
  entities,
  practiceClients,
  contractors,
  PRACTICE_CLIENT_STATUSES,
  type PracticeClientStatus,
} from "@/lib/db/schema";
import { and, asc, eq, isNull } from "drizzle-orm";
import { Page, PageHeader, EmptyState } from "@/components/ui";
import { Board } from "./_client";
import { logPhiRead } from "@/lib/audit";

export const dynamic = "force-dynamic";

export default async function BoardPage() {
  const [entity] = await db
    .select({ id: entities.id })
    .from(entities)
    .where(eq(entities.slug, "path-to-change"));
  if (!entity) {
    return (
      <Page>
        <PageHeader title="Board" />
        <EmptyState
          title="Path to Change entity not found"
          description="Seed it via npm run db:seed first."
        />
      </Page>
    );
  }

  const clients = await db
    .select({
      id: practiceClients.id,
      displayInitials: practiceClients.displayInitials,
      preferredFirstName: practiceClients.preferredFirstName,
      status: practiceClients.status,
      primaryCounselorId: practiceClients.primaryCounselorId,
      lastSessionAt: practiceClients.lastSessionAt,
      totalSessions: practiceClients.totalSessions,
    })
    .from(practiceClients)
    .where(
      and(
        eq(practiceClients.entityId, entity.id),
        isNull(practiceClients.archivedAt)
      )
    )
    .orderBy(asc(practiceClients.displayInitials));

  const counselorRoster = await db
    .select({
      id: contractors.id,
      legalName: contractors.legalName,
      dba: contractors.dba,
    })
    .from(contractors)
    .where(eq(contractors.entityId, entity.id));
  const counselorName = (id: string | null) =>
    id ? (counselorRoster.find((c) => c.id === id)?.dba ?? counselorRoster.find((c) => c.id === id)?.legalName ?? null) : null;

  await logPhiRead({
    context: "/practice/board",
    count: clients.length,
  });

  const cardsByStatus = PRACTICE_CLIENT_STATUSES.reduce<
    Record<PracticeClientStatus, typeof clients>
  >((acc, s) => {
    acc[s] = [];
    return acc;
  }, {} as Record<PracticeClientStatus, typeof clients>);

  for (const c of clients) {
    const s = (PRACTICE_CLIENT_STATUSES as readonly string[]).includes(c.status)
      ? (c.status as PracticeClientStatus)
      : "lead";
    cardsByStatus[s].push(c);
  }

  const mapped = Object.fromEntries(
    Object.entries(cardsByStatus).map(([s, list]) => [
      s,
      list.map((c) => ({
        id: c.id,
        displayInitials: c.displayInitials,
        preferredFirstName: c.preferredFirstName,
        primaryCounselorName: counselorName(c.primaryCounselorId),
        lastSessionAt: c.lastSessionAt
          ? c.lastSessionAt.toISOString()
          : null,
        totalSessions: c.totalSessions,
      })),
    ])
  ) as Record<PracticeClientStatus, ReturnType<typeof toCard>[]>;

  return (
    <Page>
      <PageHeader
        title="Board"
        subtitle="Drag a card to move a client between pipeline stages."
      />
      {clients.length === 0 ? (
        <EmptyState
          title="No clients yet"
          description="Log inquiries on /practice to populate the board."
        />
      ) : (
        <Board cardsByStatus={mapped} />
      )}
    </Page>
  );
}

// type helper for the mapped object — keeps the cast above readable
function toCard(c: { id: string }) {
  return c as unknown as {
    id: string;
    displayInitials: string;
    preferredFirstName: string | null;
    primaryCounselorName: string | null;
    lastSessionAt: string | null;
    totalSessions: number;
  };
}
