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
