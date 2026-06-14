import { db } from "@/lib/db";
import { auditEvents } from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/current-user";

export type AuditInput = {
  eventKind: string;
  summary: string;
  resourceKind?: string;
  resourceId?: string | null;
  meta?: Record<string, unknown>;
};

/**
 * Append an audit-log entry. Always best-effort — auditing failures
 * must not break the underlying write.
 *
 * Common event kinds:
 *   tag.contractor / tag.employee / flag.transfer.on / flag.transfer.off
 *   update.notes / w9.upload / w9.on_file / paperwork.upload
 *   filter.save / filter.delete
 *   phi_read — read of a practice_clients row (counselor names, initials,
 *     session history). Use logPhiRead() below for a typed helper.
 */
export async function logAudit(input: AuditInput): Promise<void> {
  try {
    const user = await getCurrentUser();
    await db.insert(auditEvents).values({
      userId: user?.id ?? null,
      eventKind: input.eventKind,
      resourceKind: input.resourceKind ?? null,
      resourceId: input.resourceId ?? null,
      summary: input.summary,
      meta: input.meta ?? null,
    });
  } catch (err) {
    // Don't surface — write the original change anyway
    console.warn("audit log failed:", input.eventKind, err);
  }
}

/**
 * PHI access marker. Call before returning a practice_clients row
 * (or a list of them) to the user. Cheap insert; queryable later.
 * Don't await per row in a hot loop — call once with a count.
 */
export async function logPhiRead(opts: {
  resourceId?: string | null;
  count?: number;
  context: string; // "/practice dashboard", "/practice/clients/[id]", etc.
}): Promise<void> {
  await logAudit({
    eventKind: "phi_read",
    summary:
      opts.count != null && opts.count !== 1
        ? `Read ${opts.count} client rows (${opts.context})`
        : `Read client row (${opts.context})`,
    resourceKind: "practice_client",
    resourceId: opts.resourceId ?? null,
    meta: { context: opts.context, count: opts.count },
  });
}
