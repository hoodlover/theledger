"use server";

import { db } from "@/lib/db";
import {
  practiceClients,
  practiceClientCounselors,
  practiceSessions,
  practiceEvents,
  entities,
} from "@/lib/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { logAudit } from "@/lib/audit";
import { requireCurrentUser } from "@/lib/current-user";

// Path to Change is the only entity using this for now, but we resolve
// by slug so the dashboard can extend to other entities later without
// hard-coding ids.
async function ptcEntityId(): Promise<string> {
  const [e] = await db
    .select({ id: entities.id })
    .from(entities)
    .where(eq(entities.slug, "path-to-change"));
  if (!e) throw new Error("Path to Change entity not found");
  return e.id;
}

function nullable(s: FormDataEntryValue | null | undefined): string | null {
  const t = String(s ?? "").trim();
  return t.length ? t : null;
}

function pickFirstName(name: string): string | null {
  const t = name.trim().split(/\s+/)[0];
  return t || null;
}

function buildInitials(rawName: string): string {
  // "Sanona Williams" → "S.W.", "Juan David Mejia" → "J.M."
  const parts = rawName
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0][0].toUpperCase() + ".";
  return `${parts[0][0].toUpperCase()}.${parts[parts.length - 1][0].toUpperCase()}.`;
}

// ───────── Log a new inquiry (top-of-page button) ─────────
//
// If `createClient` is true, we ALSO create the practice_clients row
// + the practice_client_counselors history row up-front. Otherwise we
// just drop a practice_events row that lives in the inbox until
// Heather resolves it later.

export async function logInquiry(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const user = await requireCurrentUser();
  const entityId = await ptcEntityId();

  const sourceRaw = String(formData.get("source") ?? "manual");
  const sourceMap: Record<string, { eventKind: string; eventSource: string }> = {
    email_inquiry: { eventKind: "inquiry_email", eventSource: "email" },
    dialpad_sms: { eventKind: "inquiry_sms", eventSource: "dialpad_sms" },
    dialpad_voicemail: { eventKind: "voicemail", eventSource: "dialpad_voicemail" },
    referral: { eventKind: "referral_note", eventSource: "manual" },
    walkin: { eventKind: "walkin", eventSource: "manual" },
    manual: { eventKind: "manual", eventSource: "manual" },
  };
  const { eventKind, eventSource } = sourceMap[sourceRaw] ?? sourceMap.manual;

  const rawName = String(formData.get("name") ?? "").trim();
  const counselorId = nullable(formData.get("counselorId"));
  const notes = nullable(formData.get("notes"));
  const occurredAtRaw = nullable(formData.get("occurredAt"));
  const occurredAt = occurredAtRaw ? new Date(occurredAtRaw) : new Date();
  const createClient = String(formData.get("createClient") ?? "false") === "true";

  if (!rawName) return { ok: false, error: "Name required" };

  let clientId: string | null = null;

  if (createClient) {
    const initials = buildInitials(rawName);
    const preferredFirstName = pickFirstName(rawName);
    const [created] = await db
      .insert(practiceClients)
      .values({
        entityId,
        displayInitials: initials,
        preferredFirstName,
        source: sourceRaw,
        status: "active",
        primaryCounselorId: counselorId,
        firstContactAt: occurredAt,
      })
      .returning({ id: practiceClients.id });
    clientId = created.id;

    if (counselorId) {
      await db.insert(practiceClientCounselors).values({
        clientId,
        counselorId,
        startedAt: occurredAt,
      });
    }
  }

  await db.insert(practiceEvents).values({
    entityId,
    kind: eventKind,
    source: eventSource,
    occurredAt,
    clientId,
    counselorId,
    payload: notes ? { snippet: notes.slice(0, 300) } : null,
    resolvedAt: clientId ? new Date() : null,
  });

  await logAudit({
    eventKind: "practice.inquiry.log",
    summary: createClient
      ? `Logged inquiry + created client ${buildInitials(rawName)}`
      : `Logged inquiry (${sourceRaw})`,
    resourceKind: clientId ? "practice_client" : "practice_event",
    resourceId: clientId,
    meta: { source: sourceRaw, createClient, userId: user.id },
  });

  revalidatePath("/practice");
  return { ok: true };
}

// ───────── Log a session (per-counselor row → button) ─────────

export async function logSession(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const user = await requireCurrentUser();
  const entityId = await ptcEntityId();

  const clientId = nullable(formData.get("clientId"));
  const counselorId = String(formData.get("counselorId") ?? "");
  const scheduledForRaw = String(formData.get("scheduledFor") ?? "");
  const completedRaw = nullable(formData.get("completedAt"));
  const noShow = String(formData.get("noShow") ?? "false") === "true";
  const cancelled = String(formData.get("cancelled") ?? "false") === "true";
  const feeRaw = nullable(formData.get("feeCents"));

  if (!counselorId) return { ok: false, error: "Counselor required" };
  if (!scheduledForRaw) return { ok: false, error: "Scheduled date required" };

  const scheduledFor = new Date(scheduledForRaw);
  if (Number.isNaN(scheduledFor.getTime())) {
    return { ok: false, error: "Invalid scheduled date" };
  }

  const feeCents = feeRaw ? Math.round(Number(feeRaw)) : null;

  const [session] = await db
    .insert(practiceSessions)
    .values({
      clientId,
      counselorId,
      entityId,
      scheduledFor,
      completedAt: completedRaw,
      noShow,
      cancelled,
      feeCents: Number.isFinite(feeCents) ? feeCents : null,
      source: "manual",
    })
    .returning({ id: practiceSessions.id });

  // Maintain client denormalizations (firstSessionAt, lastSessionAt,
  // totalSessions) when a session was attached and was actually completed.
  if (clientId && completedRaw && !noShow && !cancelled) {
    const [c] = await db
      .select({
        firstSessionAt: practiceClients.firstSessionAt,
        totalSessions: practiceClients.totalSessions,
      })
      .from(practiceClients)
      .where(eq(practiceClients.id, clientId));
    if (c) {
      const completedTs = new Date(completedRaw);
      const newFirst =
        c.firstSessionAt && new Date(c.firstSessionAt) <= completedTs
          ? c.firstSessionAt
          : completedTs;
      await db
        .update(practiceClients)
        .set({
          firstSessionAt: newFirst,
          lastSessionAt: completedTs,
          totalSessions: (c.totalSessions ?? 0) + 1,
        })
        .where(eq(practiceClients.id, clientId));
    }
  }

  await logAudit({
    eventKind: "practice.session.log",
    summary: `Logged session for counselor on ${scheduledForRaw}`,
    resourceKind: "practice_session",
    resourceId: session.id,
    meta: { clientId, counselorId, noShow, cancelled, userId: user.id },
  });

  revalidatePath("/practice");
  return { ok: true };
}

// ───────── One-click no-show / cancel / un-flag on a session row ─────────

export async function toggleSessionFlag(
  id: string,
  field: "noShow" | "cancelled",
  value: boolean,
  reason?: string | null
): Promise<void> {
  await requireCurrentUser();
  const patch: Record<string, unknown> = {};
  if (field === "noShow") {
    patch.noShow = value;
    patch.noShowReason = value ? (reason ?? null) : null;
  }
  if (field === "cancelled") {
    patch.cancelled = value;
    patch.cancellationReason = value ? (reason ?? null) : null;
  }
  // Toggling to a non-attended state nukes completedAt so totals don't double-count.
  if (value) patch.completedAt = null;

  await db.update(practiceSessions).set(patch).where(eq(practiceSessions.id, id));

  await logAudit({
    eventKind: `practice.session.${field}.${value ? "on" : "off"}`,
    summary: `${value ? "Marked" : "Unmarked"} session as ${field === "noShow" ? "no-show" : "cancelled"}${value && reason ? ` (${reason})` : ""}`,
    resourceKind: "practice_session",
    resourceId: id,
    meta: value && reason ? { reason } : undefined,
  });

  revalidatePath("/practice");
}

// ───────── Resolve an inbox event to a client ─────────

export async function resolveInboxEvent(
  eventId: string,
  opts:
    | { mode: "existing"; clientId: string }
    | { mode: "new"; name: string; counselorId: string | null }
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireCurrentUser();
  const entityId = await ptcEntityId();

  const [evt] = await db
    .select()
    .from(practiceEvents)
    .where(eq(practiceEvents.id, eventId));
  if (!evt) return { ok: false, error: "Event not found" };

  let clientId: string;
  if (opts.mode === "existing") {
    clientId = opts.clientId;
  } else {
    const initials = buildInitials(opts.name);
    const preferredFirstName = pickFirstName(opts.name);
    const [created] = await db
      .insert(practiceClients)
      .values({
        entityId,
        displayInitials: initials,
        preferredFirstName,
        source: evt.source,
        status: "active",
        primaryCounselorId: opts.counselorId,
        firstContactAt: evt.occurredAt,
      })
      .returning({ id: practiceClients.id });
    clientId = created.id;
    if (opts.counselorId) {
      await db.insert(practiceClientCounselors).values({
        clientId,
        counselorId: opts.counselorId,
        startedAt: evt.occurredAt,
      });
    }
  }

  await db
    .update(practiceEvents)
    .set({ clientId, resolvedAt: new Date() })
    .where(eq(practiceEvents.id, eventId));

  await logAudit({
    eventKind: "practice.event.resolve",
    summary:
      opts.mode === "new"
        ? `Resolved inbox event → created client`
        : `Resolved inbox event → existing client`,
    resourceKind: "practice_event",
    resourceId: eventId,
    meta: { clientId, mode: opts.mode, userId: user.id },
  });

  revalidatePath("/practice");
  return { ok: true };
}

// ───────── Reassign counselor on a client ─────────

export async function reassignCounselor(
  clientId: string,
  newCounselorId: string,
  effectiveAt?: Date
): Promise<void> {
  await requireCurrentUser();
  const now = effectiveAt ?? new Date();

  // Close current open assignment (if any)
  await db
    .update(practiceClientCounselors)
    .set({ endedAt: now })
    .where(
      and(
        eq(practiceClientCounselors.clientId, clientId),
        isNull(practiceClientCounselors.endedAt)
      )
    );

  // Open a new one + update the denormalized primary FK
  await db.insert(practiceClientCounselors).values({
    clientId,
    counselorId: newCounselorId,
    startedAt: now,
  });
  await db
    .update(practiceClients)
    .set({ primaryCounselorId: newCounselorId })
    .where(eq(practiceClients.id, clientId));

  await logAudit({
    eventKind: "practice.client.reassign",
    summary: "Reassigned client to new counselor",
    resourceKind: "practice_client",
    resourceId: clientId,
    meta: { newCounselorId },
  });

  revalidatePath("/practice");
  revalidatePath(`/practice/clients/${clientId}`);
}

// ───────── Recompute total_sessions for one or all clients ─────────
// Called from cron later; exposed as an action so we can fire it after
// a bulk import too.

export async function recomputeClientTotals(): Promise<{ updated: number }> {
  await requireCurrentUser();
  // Single SQL pass: tally completed (not no-show, not cancelled) sessions
  // per client and reset totals + firstSessionAt + lastSessionAt.
  const res = await db.execute(sql`
    WITH agg AS (
      SELECT client_id,
             COUNT(*)::int AS n,
             MIN(completed_at)::timestamptz AS first_at,
             MAX(completed_at)::timestamptz AS last_at
        FROM practice_sessions
       WHERE client_id IS NOT NULL
         AND no_show = false
         AND cancelled = false
         AND completed_at IS NOT NULL
       GROUP BY client_id
    )
    UPDATE practice_clients pc
       SET total_sessions = COALESCE(agg.n, 0),
           first_session_at = agg.first_at,
           last_session_at = agg.last_at
      FROM agg
     WHERE pc.id = agg.client_id
  `);
  revalidatePath("/practice");
  return { updated: res.rowCount ?? 0 };
}
