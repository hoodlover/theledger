"use server";

import { db } from "@/lib/db";
import {
  practiceClients,
  practiceClientDocuments,
  practiceTasks,
  practiceTaskTemplates,
  practiceTaskTemplateItems,
  practiceNotes,
  practiceStatusHistory,
  practiceNotifications,
  practiceStandingSchedules,
  practiceSessions,
  contractors,
  entities,
  users,
  PRACTICE_CLIENT_STATUSES,
  type PracticeClientStatus,
} from "@/lib/db/schema";
import { put } from "@vercel/blob";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
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

// ───────── Client documents (intake forms, insurance cards, etc.) ─────────

const CLIENT_DOC_KINDS = [
  "intake_form",
  "insurance_card",
  "consent_form",
  "sliding_scale_agreement",
  "release_of_info",
  "other",
] as const;

export async function uploadClientDocument(
  formData: FormData
): Promise<{ ok: boolean; error?: string; blobUrl?: string }> {
  const me = await requireCurrentUser();
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return { ok: false, error: "BLOB_READ_WRITE_TOKEN not configured" };

  const clientId = String(formData.get("clientId") ?? "");
  const kindRaw = String(formData.get("kind") ?? "other");
  const kind = (CLIENT_DOC_KINDS as readonly string[]).includes(kindRaw)
    ? kindRaw
    : "other";
  const displayNameRaw = String(formData.get("displayName") ?? "").trim();
  const file = formData.get("file");

  if (!clientId) return { ok: false, error: "clientId required" };
  if (!(file instanceof File)) return { ok: false, error: "file required" };

  const [client] = await db
    .select()
    .from(practiceClients)
    .where(eq(practiceClients.id, clientId));
  if (!client) return { ok: false, error: "client not found" };

  const buf = Buffer.from(await file.arrayBuffer());
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const safeName = (file.name || "document").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
  const slug = client.displayInitials.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const blobKey = `vault/the-ledger/practice-clients/${client.entityId}/${slug}-${client.id.slice(0, 8)}/${kind}/${ts}-${safeName}`;

  const uploaded = await put(blobKey, buf, {
    access: "public",
    contentType: file.type || "application/octet-stream",
    addRandomSuffix: false,
    token,
  });

  await db.insert(practiceClientDocuments).values({
    clientId,
    entityId: client.entityId,
    kind,
    displayName: displayNameRaw || file.name || `${kind} document`,
    blobUrl: uploaded.url,
    uploadedByUserId: me.id,
  });

  await logAudit({
    eventKind: "practice.client_doc.upload",
    summary: `Uploaded ${kind} for client ${client.displayInitials}`,
    resourceKind: "practice_client",
    resourceId: clientId,
    meta: { kind, filename: file.name },
  });

  revalidatePath(`/practice/clients/${clientId}`);
  return { ok: true, blobUrl: uploaded.url };
}

export async function removeClientDocument(docId: string) {
  await requireCurrentUser();
  const [row] = await db
    .select({
      id: practiceClientDocuments.id,
      clientId: practiceClientDocuments.clientId,
      displayName: practiceClientDocuments.displayName,
      kind: practiceClientDocuments.kind,
    })
    .from(practiceClientDocuments)
    .where(eq(practiceClientDocuments.id, docId));
  if (!row) return;
  await db
    .delete(practiceClientDocuments)
    .where(eq(practiceClientDocuments.id, docId));
  await logAudit({
    eventKind: "practice.client_doc.remove",
    summary: `Removed ${row.kind} "${row.displayName}"`,
    resourceKind: "practice_client",
    resourceId: row.clientId,
    meta: { docId, kind: row.kind },
  });
  revalidatePath(`/practice/clients/${row.clientId}`);
}

// ───────── Client tags ─────────

export async function setClientTags(clientId: string, tags: string[]): Promise<void> {
  await requireCurrentUser();
  // Normalize: trim, drop empty, dedupe case-insensitively
  const cleaned: string[] = [];
  const seen = new Set<string>();
  for (const raw of tags) {
    const t = raw.trim().slice(0, 40);
    if (!t) continue;
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    cleaned.push(t);
  }

  await db
    .update(practiceClients)
    .set({ tags: cleaned.length ? cleaned : null })
    .where(eq(practiceClients.id, clientId));

  await logAudit({
    eventKind: "practice.client.tags",
    summary: `Set ${cleaned.length} tag${cleaned.length === 1 ? "" : "s"}`,
    resourceKind: "practice_client",
    resourceId: clientId,
    meta: { tags: cleaned },
  });

  revalidatePath("/practice");
  revalidatePath("/practice/board");
  revalidatePath(`/practice/clients/${clientId}`);
}

// ───────── Standing schedules (recurring sessions) ─────────

export async function createStandingSchedule(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  await requireCurrentUser();
  const entityId = nullable(formData.get("entityId"));
  const clientId = nullable(formData.get("clientId"));
  const counselorId = nullable(formData.get("counselorId"));
  const dayOfWeek = Number(formData.get("dayOfWeek"));
  const timeOfDay = String(formData.get("timeOfDay") ?? "").trim();
  const startedOn = nullable(formData.get("startedOn"));
  const weeksInterval = Number(formData.get("weeksInterval") ?? 1) || 1;
  const durationMinutes = Number(formData.get("durationMinutes") ?? 50) || 50;
  const feeCentsRaw = nullable(formData.get("feeCents"));
  const feeCents = feeCentsRaw ? Math.round(Number(feeCentsRaw)) : null;
  const notes = nullable(formData.get("notes"));

  if (!entityId || !clientId || !counselorId) return { ok: false, error: "entity/client/counselor required" };
  if (Number.isNaN(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6)
    return { ok: false, error: "dayOfWeek 0-6 required" };
  if (!/^\d{2}:\d{2}$/.test(timeOfDay)) return { ok: false, error: "timeOfDay HH:MM required" };
  if (!startedOn) return { ok: false, error: "startedOn required" };

  const [row] = await db
    .insert(practiceStandingSchedules)
    .values({
      entityId,
      clientId,
      counselorId,
      dayOfWeek,
      timeOfDay,
      durationMinutes,
      feeCents: Number.isFinite(feeCents) ? feeCents : null,
      weeksInterval,
      startedOn,
      notes,
    })
    .returning({ id: practiceStandingSchedules.id });

  await logAudit({
    eventKind: "practice.standing.create",
    summary: `Created standing schedule (day ${dayOfWeek} @ ${timeOfDay}, every ${weeksInterval}w)`,
    resourceKind: "practice_standing_schedule",
    resourceId: row.id,
    meta: { clientId, counselorId, dayOfWeek, timeOfDay, weeksInterval },
  });

  revalidatePath("/practice");
  revalidatePath(`/practice/clients/${clientId}`);
  return { ok: true };
}

export async function endStandingSchedule(id: string, endedOn?: string): Promise<void> {
  await requireCurrentUser();
  const end = endedOn ?? new Date().toISOString().slice(0, 10);
  const [row] = await db
    .select({ clientId: practiceStandingSchedules.clientId })
    .from(practiceStandingSchedules)
    .where(eq(practiceStandingSchedules.id, id));
  await db
    .update(practiceStandingSchedules)
    .set({ endedOn: end })
    .where(eq(practiceStandingSchedules.id, id));
  await logAudit({
    eventKind: "practice.standing.end",
    summary: `Ended standing schedule on ${end}`,
    resourceKind: "practice_standing_schedule",
    resourceId: id,
  });
  revalidatePath("/practice");
  if (row?.clientId) revalidatePath(`/practice/clients/${row.clientId}`);
}

// Cron-callable: walk every active standing schedule and insert
// practice_sessions rows for upcoming occurrences within `weeksForward`.
// Dedup via deterministic external_ref `standing:{scheduleId}:{YYYY-MM-DD-HH:MM}`.
export async function materializeStandingSessions(
  weeksForward = 6
): Promise<{ scheduled: number; skipped: number }> {
  const active = await db
    .select()
    .from(practiceStandingSchedules)
    .where(isNull(practiceStandingSchedules.endedOn));

  const horizon = new Date(Date.now() + weeksForward * 7 * 24 * 60 * 60 * 1000);
  let scheduled = 0;
  let skipped = 0;

  for (const ss of active) {
    // Walk forward from max(startedOn, today) to horizon, week by week
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const startBoundary = new Date(ss.startedOn + "T00:00:00Z");
    const cursor = new Date(Math.max(today.getTime(), startBoundary.getTime()));
    // Snap cursor forward to the next matching day-of-week
    const cursorDow = cursor.getUTCDay();
    const daysAhead = (ss.dayOfWeek - cursorDow + 7) % 7;
    cursor.setUTCDate(cursor.getUTCDate() + daysAhead);

    const [hh, mm] = ss.timeOfDay.split(":").map(Number);

    while (cursor <= horizon) {
      const scheduledFor = new Date(cursor);
      scheduledFor.setUTCHours(hh, mm, 0, 0);
      const externalRef = `standing:${ss.id}:${scheduledFor.toISOString().slice(0, 16)}`;

      // Skip if already materialized for this slot
      const [existing] = await db
        .select({ id: practiceSessions.id })
        .from(practiceSessions)
        .where(
          and(
            eq(practiceSessions.source, "recurring"),
            eq(practiceSessions.externalRef, externalRef)
          )
        );
      if (existing) {
        skipped += 1;
      } else {
        await db.insert(practiceSessions).values({
          clientId: ss.clientId,
          counselorId: ss.counselorId,
          entityId: ss.entityId,
          scheduledFor,
          feeCents: ss.feeCents,
          source: "recurring",
          externalRef,
          standingScheduleId: ss.id,
        });
        scheduled += 1;
      }

      // Advance by `weeksInterval` weeks
      cursor.setUTCDate(cursor.getUTCDate() + ss.weeksInterval * 7);
    }
  }

  return { scheduled, skipped };
}

// ───────── Task templates (counselor onboarding etc.) ─────────

export async function applyTaskTemplate(opts: {
  templateKind: string;
  entityId: string;
  counselorId: string;
  assignedToUserId?: string | null;
}): Promise<{ ok: boolean; created: number; error?: string }> {
  const me = await requireCurrentUser();

  const [tpl] = await db
    .select({ id: practiceTaskTemplates.id, name: practiceTaskTemplates.name })
    .from(practiceTaskTemplates)
    .where(eq(practiceTaskTemplates.kind, opts.templateKind));
  if (!tpl) return { ok: false, created: 0, error: `Template ${opts.templateKind} not found` };

  const items = await db
    .select()
    .from(practiceTaskTemplateItems)
    .where(eq(practiceTaskTemplateItems.templateId, tpl.id))
    .orderBy(asc(practiceTaskTemplateItems.sortOrder));

  if (items.length === 0) return { ok: true, created: 0 };

  const assignedTo = opts.assignedToUserId ?? me.id;
  const now = new Date();

  const inserted = await db
    .insert(practiceTasks)
    .values(
      items.map((it) => ({
        entityId: opts.entityId,
        counselorId: opts.counselorId,
        assignedToUserId: assignedTo,
        title: it.title,
        body: it.body,
        priority: it.priority,
        dueAt:
          it.dueOffsetDays != null
            ? new Date(now.getTime() + it.dueOffsetDays * 24 * 60 * 60 * 1000)
            : null,
        createdByUserId: me.id,
      }))
    )
    .returning({ id: practiceTasks.id });

  await logAudit({
    eventKind: "practice.template.apply",
    summary: `Applied template "${tpl.name}" — ${inserted.length} tasks`,
    resourceKind: "contractor",
    resourceId: opts.counselorId,
    meta: { templateKind: opts.templateKind, count: inserted.length },
  });

  revalidatePath("/practice/tasks");
  revalidatePath(`/contractors/${opts.counselorId}`);
  return { ok: true, created: inserted.length };
}

// ───────── Background cron tick — push "due soon" + "session today" alerts ─────────
//
// Called by /api/cron/practice-alerts. Idempotent within a 1-hour window
// per (recipient, kind, refId).

// Render a per-user daily digest body. Email sent via the Zoho mailer
// (same transport used by deadline reminders).
async function buildDigestForUser(userId: string, entityId: string): Promise<{
  subject: string;
  text: string;
  html: string;
  hasContent: boolean;
} | null> {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
  const fiveDaysAgo = new Date(today.getTime() - 5 * 24 * 60 * 60 * 1000);
  const prior48h = new Date(today.getTime() - 48 * 60 * 60 * 1000);

  const [myOpenTasks, todaySessions, stuckClients, stuckInquiries] = await Promise.all([
    db
      .select({ title: practiceTasks.title, dueAt: practiceTasks.dueAt, priority: practiceTasks.priority })
      .from(practiceTasks)
      .where(
        and(
          eq(practiceTasks.entityId, entityId),
          eq(practiceTasks.assignedToUserId, userId),
          sql`${practiceTasks.status} not in ('done','wont_do')`
        )
      )
      .orderBy(asc(practiceTasks.dueAt)),
    db
      .select({ scheduledFor: practiceSessions.scheduledFor })
      .from(practiceSessions)
      .where(
        and(
          eq(practiceSessions.entityId, entityId),
          sql`${practiceSessions.scheduledFor} >= ${today.toISOString()}`,
          sql`${practiceSessions.scheduledFor} < ${tomorrow.toISOString()}`
        )
      ),
    db
      .select({
        displayInitials: practiceClients.displayInitials,
        preferredFirstName: practiceClients.preferredFirstName,
      })
      .from(practiceClients)
      .where(
        and(
          eq(practiceClients.entityId, entityId),
          eq(practiceClients.status, "scheduling"),
          sql`${practiceClients.createdAt} <= ${fiveDaysAgo.toISOString()}`
        )
      ),
    db
      .select({ id: sql<string>`${practiceClients.id}` })
      .from(practiceClients)
      .innerJoin(sql`practice_events pe`, sql`pe.client_id = ${practiceClients.id}`)
      .where(
        sql`pe.entity_id = ${entityId}
            AND pe.resolved_at IS NULL
            AND pe.occurred_at < ${prior48h.toISOString()}
            AND pe.kind IN ('inquiry_email','inquiry_sms','voicemail')`
      ),
  ]).catch((err) => {
    console.warn("digest build failed:", err);
    return [[], [], [], []] as const;
  });

  const hasContent =
    myOpenTasks.length > 0 ||
    todaySessions.length > 0 ||
    stuckClients.length > 0 ||
    stuckInquiries.length > 0;
  if (!hasContent) return null;

  const dateLabel = today.toISOString().slice(0, 10);
  const subject = `Practice — ${dateLabel} · ${myOpenTasks.length} task${myOpenTasks.length === 1 ? "" : "s"}, ${todaySessions.length} session${todaySessions.length === 1 ? "" : "s"}`;

  const lines: string[] = [];
  lines.push(`Practice digest — ${dateLabel}`);
  lines.push("");
  if (myOpenTasks.length > 0) {
    lines.push(`Tasks assigned to you (${myOpenTasks.length}):`);
    for (const t of myOpenTasks.slice(0, 10)) {
      const due = t.dueAt ? ` · due ${t.dueAt.toISOString().slice(0, 10)}` : "";
      const pri = t.priority === "high" ? " [HIGH]" : "";
      lines.push(`  • ${t.title}${due}${pri}`);
    }
    if (myOpenTasks.length > 10) lines.push(`  …and ${myOpenTasks.length - 10} more`);
    lines.push("");
  }
  if (todaySessions.length > 0) {
    lines.push(`Sessions today: ${todaySessions.length}`);
    lines.push("");
  }
  if (stuckClients.length > 0) {
    lines.push(`Clients stuck in scheduling > 5 days (${stuckClients.length}):`);
    for (const c of stuckClients.slice(0, 10)) {
      lines.push(
        `  • ${c.displayInitials}${c.preferredFirstName ? ` (${c.preferredFirstName})` : ""}`
      );
    }
    if (stuckClients.length > 10) lines.push(`  …and ${stuckClients.length - 10} more`);
    lines.push("");
  }
  if (stuckInquiries.length > 0) {
    lines.push(`Unanswered inquiries > 48h: ${stuckInquiries.length}`);
    lines.push("");
  }
  lines.push("Open the practice dashboard at https://handsheldopen.com/practice");

  const html = `<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0f172a;line-height:1.5;max-width:560px;margin:0 auto;padding:24px;">
  <h2 style="font-family:Georgia,serif;color:#0f172a;margin:0 0 4px 0;">Practice digest</h2>
  <div style="color:#6b7280;font-size:12px;margin-bottom:16px;">${dateLabel}</div>
  ${myOpenTasks.length > 0 ? `
  <h3 style="color:#5e7d66;font-size:14px;text-transform:uppercase;letter-spacing:.14em;margin:16px 0 8px 0;">Tasks assigned to you (${myOpenTasks.length})</h3>
  <ul style="padding-left:18px;margin:0 0 12px;">
    ${myOpenTasks.slice(0, 10).map((t) => `<li>${escapeHtml(t.title)}${t.dueAt ? ` · <span style="color:#6b7280;">due ${t.dueAt.toISOString().slice(0, 10)}</span>` : ""}${t.priority === "high" ? ` <strong style="color:#8b3a3f;">[HIGH]</strong>` : ""}</li>`).join("")}
  </ul>` : ""}
  ${todaySessions.length > 0 ? `<p><strong>Sessions today:</strong> ${todaySessions.length}</p>` : ""}
  ${stuckClients.length > 0 ? `
  <h3 style="color:#8b3a3f;font-size:14px;text-transform:uppercase;letter-spacing:.14em;margin:16px 0 8px 0;">Stuck in scheduling > 5d (${stuckClients.length})</h3>
  <ul style="padding-left:18px;margin:0 0 12px;">
    ${stuckClients.slice(0, 10).map((c) => `<li>${escapeHtml(c.displayInitials)}${c.preferredFirstName ? ` (${escapeHtml(c.preferredFirstName)})` : ""}</li>`).join("")}
  </ul>` : ""}
  ${stuckInquiries.length > 0 ? `<p style="color:#8b3a3f;"><strong>Unanswered inquiries &gt; 48h:</strong> ${stuckInquiries.length}</p>` : ""}
  <p style="margin-top:24px;"><a href="https://handsheldopen.com/practice" style="background:#0f172a;color:#fff;padding:10px 20px;border-radius:999px;text-decoration:none;font-weight:600;">Open the practice dashboard</a></p>
</body></html>`;

  return { subject, text: lines.join("\n"), html, hasContent };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[c]!);
}

// Cron-callable: send the daily digest to active practice users
// (Heather, Meg, anyone else with practice access).
export async function runDailyDigest(): Promise<{ sent: number; skipped: number }> {
  const { sendMail } = await import("@/lib/mailer");

  const [ptc] = await db
    .select({ id: entities.id })
    .from(entities)
    .where(eq(entities.slug, "path-to-change"));
  if (!ptc) return { sent: 0, skipped: 0 };

  const DIGEST_RECIPIENTS = [
    "hbcobb6@gmail.com",
    "meg@pathtochange.net",
    "lance.climb@gmail.com",
  ];
  const recipients = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(
      sql`lower(email) = any(${sql`array[${sql.join(
        DIGEST_RECIPIENTS.map((e) => sql`${e.toLowerCase()}`),
        sql`, `
      )}]::text[]`})`
    );

  let sent = 0;
  let skipped = 0;
  for (const u of recipients) {
    const digest = await buildDigestForUser(u.id, ptc.id);
    if (!digest) {
      skipped += 1;
      continue;
    }
    try {
      await sendMail({
        to: u.email,
        subject: digest.subject,
        text: digest.text,
        html: digest.html,
      });
      sent += 1;
    } catch (err) {
      console.warn(`digest to ${u.email} failed:`, err);
      skipped += 1;
    }
  }

  return { sent, skipped };
}

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
