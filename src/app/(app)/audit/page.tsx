import Link from "next/link";
import {
  Page,
  PageHeader,
  Card,
  StatusPill,
  EmptyState,
} from "@/components/ui";
import { db } from "@/lib/db";
import { auditEvents, users } from "@/lib/db/schema";
import { eq, desc, sql, and } from "drizzle-orm";

export const dynamic = "force-dynamic";

type SP = Promise<{ user?: string; kind?: string }>;

const KIND_LABEL: Record<string, string> = {
  "tag.contractor": "Tag contractor",
  "tag.contractor.bulk": "Bulk tag contractor",
  "untag.contractor": "Untag contractor",
  "tag.employee": "Tag employee",
  "tag.employee.bulk": "Bulk tag employee",
  "untag.employee": "Untag employee",
  "flag.transfer.on": "Flag transfer",
  "flag.transfer.off": "Unflag transfer",
  "flag.transfer.on.bulk": "Bulk flag transfer",
  "flag.transfer.off.bulk": "Bulk unflag transfer",
  "update.notes": "Update notes",
  "update.notes.bulk": "Bulk update notes",
  "manual.create": "Manual entry",
  "doc.upload": "Upload document",
  "w9.upload": "Upload W-9",
  "w9.on_file": "Mark W-9 on file",
  "w9.off_file": "Unmark W-9 on file",
  "paperwork.upload": "Upload paperwork",
  "paperwork.remove": "Remove paperwork",
  "filter.save": "Save filter",
  "filter.delete": "Delete filter",
  "entity.update": "Edit entity",
  "auth.password_change": "Password changed",
  "mileage.add": "Log mileage",
  // ────── Practice
  "practice.inquiry.log": "Log inquiry",
  "practice.session.log": "Log session",
  "practice.session.noShow.on": "Mark no-show",
  "practice.session.noShow.off": "Unmark no-show",
  "practice.session.cancelled.on": "Cancel session",
  "practice.session.cancelled.off": "Uncancel session",
  "practice.event.resolve": "Resolve inbox event",
  "practice.client.reassign": "Reassign counselor",
  "practice.client.status": "Move pipeline stage",
  "practice.client.tags": "Update tags",
  "practice.client_doc.upload": "Upload client doc",
  "practice.client_doc.remove": "Remove client doc",
  "practice.task.create": "Create task",
  "practice.task.status": "Task status change",
  "practice.task.reassign": "Reassign task",
  "practice.note.create": "Add note",
  "practice.standing.create": "Create standing slot",
  "practice.standing.end": "End standing slot",
  "practice.template.apply": "Apply template",
  phi_read: "PHI read",
  // ────── Cron
  "cron.deadlines": "Cron — deadlines",
  "cron.rules_check": "Cron — rules check",
  "cron.practice_alerts": "Cron — practice alerts",
  "cron.practice_materialize": "Cron — materialize",
  "cron.practice_digest": "Cron — daily digest",
  "comp_export.download": "Download comp CSV",
};

const KIND_TONE: Record<string, "neutral" | "success" | "warning" | "danger" | "accent" | "gold"> = {
  "tag.contractor": "accent",
  "tag.contractor.bulk": "accent",
  "tag.employee": "accent",
  "tag.employee.bulk": "accent",
  "untag.contractor": "neutral",
  "untag.employee": "neutral",
  "flag.transfer.on": "warning",
  "flag.transfer.off": "neutral",
  "flag.transfer.on.bulk": "warning",
  "flag.transfer.off.bulk": "neutral",
  "update.notes": "neutral",
  "update.notes.bulk": "neutral",
  "manual.create": "success",
  "doc.upload": "success",
  "w9.upload": "success",
  "w9.on_file": "success",
  "w9.off_file": "warning",
  "paperwork.upload": "success",
  "paperwork.remove": "neutral",
  "filter.save": "neutral",
  "filter.delete": "neutral",
  "entity.update": "accent",
  "auth.password_change": "warning",
  "mileage.add": "success",
  "practice.inquiry.log": "accent",
  "practice.session.log": "success",
  "practice.session.noShow.on": "danger",
  "practice.session.noShow.off": "neutral",
  "practice.session.cancelled.on": "warning",
  "practice.session.cancelled.off": "neutral",
  "practice.event.resolve": "success",
  "practice.client.reassign": "accent",
  "practice.client.status": "accent",
  "practice.client.tags": "neutral",
  "practice.client_doc.upload": "success",
  "practice.client_doc.remove": "neutral",
  "practice.task.create": "accent",
  "practice.task.status": "neutral",
  "practice.task.reassign": "neutral",
  "practice.note.create": "neutral",
  "practice.standing.create": "success",
  "practice.standing.end": "neutral",
  "practice.template.apply": "success",
  phi_read: "gold",
  "cron.deadlines": "neutral",
  "cron.rules_check": "neutral",
  "cron.practice_alerts": "neutral",
  "cron.practice_materialize": "neutral",
  "cron.practice_digest": "neutral",
  "comp_export.download": "neutral",
};

function hrefForResource(kind: string | null, id: string | null): string | null {
  if (!kind || !id) return null;
  switch (kind) {
    case "transaction":
      return `/transactions?txn=${id}`;
    case "contractor":
      return `/contractors/${id}`;
    case "employee":
      return `/employees/${id}`;
    case "manual_entry":
      return `/quick-entry`;
    case "document":
      return `/docs`;
    case "entity":
      return `/entities`;
    case "mileage":
      return `/mileage`;
    case "user":
      return `/settings`;
    case "practice_client":
      return `/practice/clients/${id}`;
    case "practice_task":
      return `/practice/tasks`;
    case "practice_session":
      return `/practice`;
    case "practice_event":
      return `/practice`;
    case "practice_standing_schedule":
      return `/practice`;
    case "saved_filter":
      return `/transactions`;
    default:
      return null;
  }
}

function timeAgo(date: Date, asOf: Date): string {
  const diffMs = asOf.getTime() - date.getTime();
  const m = Math.floor(diffMs / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 14) return `${d}d ago`;
  return date.toISOString().slice(0, 10);
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: SP;
}) {
  const sp = await searchParams;
  const filterUser = sp.user;
  const filterKind = sp.kind;
  const now = new Date();

  const allUsers = await db
    .select({ id: users.id, name: users.name })
    .from(users);

  const conditions = [];
  if (filterUser) conditions.push(eq(auditEvents.userId, filterUser));
  if (filterKind) conditions.push(eq(auditEvents.eventKind, filterKind));
  const where = conditions.length ? and(...conditions) : undefined;

  const events = await db
    .select({
      id: auditEvents.id,
      eventKind: auditEvents.eventKind,
      summary: auditEvents.summary,
      resourceKind: auditEvents.resourceKind,
      resourceId: auditEvents.resourceId,
      createdAt: auditEvents.createdAt,
      userName: users.name,
      userId: users.id,
    })
    .from(auditEvents)
    .leftJoin(users, eq(users.id, auditEvents.userId))
    .where(where!)
    .orderBy(desc(auditEvents.createdAt))
    .limit(200);

  // Distinct event kinds present in DB (for filter chips)
  const distinctKinds = await db
    .selectDistinct({ kind: auditEvents.eventKind })
    .from(auditEvents);

  function chipHref(patch: Record<string, string | undefined>): string {
    const p = new URLSearchParams();
    const u = filterUser ?? "";
    const k = filterKind ?? "";
    const finalUser = patch.user !== undefined ? patch.user : u;
    const finalKind = patch.kind !== undefined ? patch.kind : k;
    if (finalUser) p.set("user", finalUser);
    if (finalKind) p.set("kind", finalKind);
    const qs = p.toString();
    return qs ? `/audit?${qs}` : "/audit";
  }

  return (
    <Page>
      <PageHeader
        title="Activity"
        subtitle={`Last ${events.length} events. ${filterUser || filterKind ? "Filtered" : "All users + all event kinds"}.`}
      />

      <div className="flex flex-wrap gap-2 text-xs">
        <Link
          href={chipHref({ user: "" })}
          className={`rounded-full border px-3 py-1 ${
            !filterUser
              ? "border-[var(--foreground)] bg-[var(--foreground)] text-white"
              : "border-[var(--border)] text-[var(--muted)] hover:bg-[var(--surface-warm)]"
          }`}
        >
          All users
        </Link>
        {allUsers.map((u) => (
          <Link
            key={u.id}
            href={chipHref({ user: u.id })}
            className={`rounded-full border px-3 py-1 ${
              filterUser === u.id
                ? "border-[var(--foreground)] bg-[var(--foreground)] text-white"
                : "border-[var(--border)] text-[var(--muted)] hover:bg-[var(--surface-warm)]"
            }`}
          >
            {u.name}
          </Link>
        ))}
        <span className="text-[var(--muted)]">·</span>
        <Link
          href={chipHref({ kind: "" })}
          className={`rounded-full border px-3 py-1 ${
            !filterKind
              ? "border-[var(--foreground)] bg-[var(--foreground)] text-white"
              : "border-[var(--border)] text-[var(--muted)] hover:bg-[var(--surface-warm)]"
          }`}
        >
          All kinds
        </Link>
        {distinctKinds.map((k) => (
          <Link
            key={k.kind}
            href={chipHref({ kind: k.kind })}
            className={`rounded-full border px-3 py-1 ${
              filterKind === k.kind
                ? "border-[var(--foreground)] bg-[var(--foreground)] text-white"
                : "border-[var(--border)] text-[var(--muted)] hover:bg-[var(--surface-warm)]"
            }`}
          >
            {KIND_LABEL[k.kind] ?? k.kind}
          </Link>
        ))}
      </div>

      {events.length === 0 ? (
        <EmptyState
          title="No activity yet"
          description="Tag a transaction, upload a document, or log a trip — anything that writes data shows up here."
        />
      ) : (
        <Card>
          <ul className="divide-y divide-[var(--border)]">
            {events.map((e) => {
              const href = hrefForResource(e.resourceKind, e.resourceId);
              const tone = KIND_TONE[e.eventKind] ?? "neutral";
              return (
                <li key={e.id} className="px-5 py-3.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusPill tone={tone}>
                          {KIND_LABEL[e.eventKind] ?? e.eventKind}
                        </StatusPill>
                        <span className="font-medium text-[var(--foreground)] truncate">
                          {e.summary}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-[var(--muted)]">
                        {e.userName ?? "system"} ·{" "}
                        <span className="tabular">
                          {timeAgo(new Date(e.createdAt), now)}
                        </span>
                      </div>
                    </div>
                    {href && (
                      <Link
                        href={href}
                        className="text-xs text-[var(--accent)] hover:underline whitespace-nowrap"
                      >
                        Open →
                      </Link>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </Page>
  );
}
