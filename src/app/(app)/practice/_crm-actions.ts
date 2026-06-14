"use server";

import { db } from "@/lib/db";
import {
  practiceClients,
  practiceTasks,
  practiceNotes,
  practiceStatusHistory,
  practiceNotifications,
  users,
  PRACTICE_CLIENT_STATUSES,
  type PracticeClientStatus,
} from "@/lib/db/schema";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { logAudit } from "@/lib/audit";
import { requireCurrentUser } from "@/lib/current-user";

function nullable(s: FormDataEntryValue | null | undefined): string | null {
  const t = String(s ?? "").trim();
  return t.length ? t : null;
}

// ───────── Status transitions (kanban drag-to-move) ─────────

export async function changeClientStatus(
  clientId: string,
  toStatus: PracticeClientStatus
): Promise<{ ok: boolean; error?: string }> {
  const me = await requireCurrentUser();

  if (!PRACTICE_CLIENT_STATUSES.includes(toStatus)) {
    return { ok: false, error: "Unknown status" };
  }

  const [client] = await db
    .select({ id: practiceClients.id, status: practiceClients.status })
    .from(practiceClients)
    .where(eq(practiceClients.id, clientId));
  if (!client) return { ok: false, error: "Client not found" };
  if (client.status === toStatus) return { ok: true };

  await db
    .update(practiceClients)
    .set({ status: toStatus })
    .where(eq(practiceClients.id, clientId));

  await db.insert(practiceStatusHistory).values({
    clientId,
    fromStatus: client.status,
    toStatus,
    changedByUserId: me.id,
  });

  await logAudit({
    eventKind: "practice.client.status",
    summary: `Moved client ${client.status} → ${toStatus}`,
    resourceKind: "practice_client",
    resourceId: clientId,
    meta: { fromStatus: client.status, toStatus, userId: me.id },
  });

  revalidatePath("/practice");
  revalidatePath("/practice/board");
  revalidatePath(`/practice/clients/${clientId}`);
  return { ok: true };
}

// ───────── Tasks ─────────

export async function createTask(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const me = await requireCurrentUser();
  const entityIdRaw = nullable(formData.get("entityId"));
  if (!entityIdRaw) return { ok: false, error: "entityId required" };

  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { ok: false, error: "Title required" };

  const body = nullable(formData.get("body"));
  const clientId = nullable(formData.get("clientId"));
  const counselorId = nullable(formData.get("counselorId"));
  const assignedToUserId = nullable(formData.get("assignedToUserId"));
  const priority = String(formData.get("priority") ?? "normal");
  const dueAtRaw = nullable(formData.get("dueAt"));
  const dueAt = dueAtRaw ? new Date(dueAtRaw) : null;

  const [task] = await db
    .insert(practiceTasks)
    .values({
      entityId: entityIdRaw,
      clientId,
      counselorId,
      assignedToUserId,
      title,
      body,
      priority,
      dueAt,
      createdByUserId: me.id,
    })
    .returning({ id: practiceTasks.id });

  // Notify the assignee if it isn't the creator
  if (assignedToUserId && assignedToUserId !== me.id) {
    await db.insert(practiceNotifications).values({
      recipientUserId: assignedToUserId,
      kind: "task_assigned",
      refKind: "practice_task",
      refId: task.id,
      summary: `New task: ${title}`,
    });
  }

  await logAudit({
    eventKind: "practice.task.create",
    summary: `Created task "${title}"`,
    resourceKind: "practice_task",
    resourceId: task.id,
    meta: { clientId, assignedToUserId, priority },
  });

  revalidatePath("/practice");
  revalidatePath("/practice/tasks");
  if (clientId) revalidatePath(`/practice/clients/${clientId}`);
  return { ok: true };
}

export async function updateTaskStatus(
  taskId: string,
  status: "open" | "in_progress" | "waiting" | "done" | "wont_do"
): Promise<void> {
  await requireCurrentUser();
  const patch: Record<string, unknown> = { status, updatedAt: new Date() };
  if (status === "done" || status === "wont_do") {
    patch.completedAt = new Date();
  } else {
    patch.completedAt = null;
  }
  await db.update(practiceTasks).set(patch).where(eq(practiceTasks.id, taskId));

  await logAudit({
    eventKind: "practice.task.status",
    summary: `Task → ${status}`,
    resourceKind: "practice_task",
    resourceId: taskId,
  });

  revalidatePath("/practice");
  revalidatePath("/practice/tasks");
}

export async function reassignTask(
  taskId: string,
  newAssigneeUserId: string | null
): Promise<void> {
  const me = await requireCurrentUser();
  await db
    .update(practiceTasks)
    .set({ assignedToUserId: newAssigneeUserId, updatedAt: new Date() })
    .where(eq(practiceTasks.id, taskId));

  if (newAssigneeUserId && newAssigneeUserId !== me.id) {
    const [t] = await db
      .select({ title: practiceTasks.title })
      .from(practiceTasks)
      .where(eq(practiceTasks.id, taskId));
    await db.insert(practiceNotifications).values({
      recipientUserId: newAssigneeUserId,
      kind: "task_assigned",
      refKind: "practice_task",
      refId: taskId,
      summary: `Reassigned to you: ${t?.title ?? "task"}`,
    });
  }

  await logAudit({
    eventKind: "practice.task.reassign",
    summary: "Reassigned task",
    resourceKind: "practice_task",
    resourceId: taskId,
  });

  revalidatePath("/practice/tasks");
}

// ───────── Notes thread ─────────

const MENTION_RE = /@([a-zA-Z0-9._-]+)/g;

async function resolveMentionsToUserIds(body: string): Promise<string[]> {
  const matches = [...body.matchAll(MENTION_RE)].map((m) => m[1].toLowerCase());
  if (matches.length === 0) return [];
  // Match against the local-part of user emails (everything before @) OR the
  // first word of the name. Cheap, predictable.
  const allUsers = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users);
  const found = new Set<string>();
  for (const handle of matches) {
    for (const u of allUsers) {
      const localPart = u.email.split("@")[0].toLowerCase();
      const firstNameSlug = u.name.split(/\s+/)[0].toLowerCase();
      if (localPart === handle || firstNameSlug === handle) {
        found.add(u.id);
      }
    }
  }
  return [...found];
}

export async function addNote(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const me = await requireCurrentUser();
  const entityId = nullable(formData.get("entityId"));
  if (!entityId) return { ok: false, error: "entityId required" };

  const body = String(formData.get("body") ?? "").trim();
  if (!body) return { ok: false, error: "Note body required" };

  const clientId = nullable(formData.get("clientId"));
  const taskId = nullable(formData.get("taskId"));

  const mentionsUserIds = await resolveMentionsToUserIds(body);

  const [note] = await db
    .insert(practiceNotes)
    .values({
      entityId,
      clientId,
      taskId,
      authorUserId: me.id,
      body,
      mentionsUserIds: mentionsUserIds.length ? mentionsUserIds : null,
    })
    .returning({ id: practiceNotes.id });

  // Fan out @mention notifications (don't notify the author of themselves)
  const others = mentionsUserIds.filter((uid) => uid !== me.id);
  if (others.length > 0) {
    await db.insert(practiceNotifications).values(
      others.map((uid) => ({
        recipientUserId: uid,
        kind: "mention",
        refKind: clientId ? "practice_client" : "practice_task",
        refId: clientId ?? taskId,
        summary: `${me.name} mentioned you: ${body.slice(0, 80)}`,
      }))
    );
  }

  await logAudit({
    eventKind: "practice.note.create",
    summary: `Added note (${mentionsUserIds.length} mentions)`,
    resourceKind: clientId ? "practice_client" : "practice_task",
    resourceId: clientId ?? taskId,
    meta: { noteId: note.id, mentions: mentionsUserIds.length },
  });

  revalidatePath("/practice");
  if (clientId) revalidatePath(`/practice/clients/${clientId}`);
  return { ok: true };
}

// ───────── Notifications ─────────

export async function markNotificationsRead(
  ids?: string[]
): Promise<{ updated: number }> {
  const me = await requireCurrentUser();
  if (ids && ids.length > 0) {
    const res = await db
      .update(practiceNotifications)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(practiceNotifications.recipientUserId, me.id),
          isNull(practiceNotifications.readAt),
          inArray(practiceNotifications.id, ids)
        )
      );
    revalidatePath("/practice");
    return { updated: res.rowCount ?? 0 };
  }
  // Mark all unread for me as read
  const res = await db
    .update(practiceNotifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(practiceNotifications.recipientUserId, me.id),
        isNull(practiceNotifications.readAt)
      )
    );
  revalidatePath("/practice");
  return { updated: res.rowCount ?? 0 };
}

// ───────── Background cron tick — push "due soon" + "session today" alerts ─────────
//
// Called by /api/cron/practice-alerts. Idempotent within a 1-hour window
// per (recipient, kind, refId).

export async function runPracticeAlerts(): Promise<{ pushed: number }> {
  const within = (mins: number) => new Date(Date.now() + mins * 60 * 1000);

  // Tasks due within next 60 minutes, not done, not already notified in the last hour.
  const tasksDueSoon = await db
    .select({
      id: practiceTasks.id,
      title: practiceTasks.title,
      assignedToUserId: practiceTasks.assignedToUserId,
      dueAt: practiceTasks.dueAt,
      status: practiceTasks.status,
    })
    .from(practiceTasks)
    .where(
      and(
        sql`${practiceTasks.dueAt} IS NOT NULL`,
        sql`${practiceTasks.dueAt} > now()`,
        sql`${practiceTasks.dueAt} <= ${within(60).toISOString()}`,
        sql`${practiceTasks.status} not in ('done','wont_do')`,
        sql`${practiceTasks.assignedToUserId} IS NOT NULL`
      )
    );

  let pushed = 0;
  for (const t of tasksDueSoon) {
    // Dedup: don't double-notify within a 1-hour window
    const [existing] = await db
      .select({ id: practiceNotifications.id })
      .from(practiceNotifications)
      .where(
        and(
          eq(practiceNotifications.recipientUserId, t.assignedToUserId!),
          eq(practiceNotifications.kind, "task_due_soon"),
          eq(practiceNotifications.refId, t.id),
          sql`${practiceNotifications.createdAt} > now() - interval '1 hour'`
        )
      );
    if (existing) continue;
    await db.insert(practiceNotifications).values({
      recipientUserId: t.assignedToUserId!,
      kind: "task_due_soon",
      refKind: "practice_task",
      refId: t.id,
      summary: `Due soon: ${t.title}`,
    });
    pushed += 1;
  }

  return { pushed };
}
