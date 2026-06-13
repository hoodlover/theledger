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
  "untag.contractor": "Untag contractor",
  "tag.employee": "Tag employee",
  "untag.employee": "Untag employee",
  "flag.transfer.on": "Flag transfer",
  "flag.transfer.off": "Unflag transfer",
  "update.notes": "Update notes",
  "manual.create": "Manual entry",
  "doc.upload": "Upload document",
  "w9.upload": "Upload W-9",
  "entity.update": "Edit entity",
  "auth.password_change": "Password changed",
  "mileage.add": "Log mileage",
};

const KIND_TONE: Record<string, "neutral" | "success" | "warning" | "danger" | "accent" | "gold"> = {
  "tag.contractor": "accent",
  "tag.employee": "accent",
  "untag.contractor": "neutral",
  "untag.employee": "neutral",
  "flag.transfer.on": "warning",
  "flag.transfer.off": "neutral",
  "update.notes": "neutral",
  "manual.create": "success",
  "doc.upload": "success",
  "w9.upload": "success",
  "entity.update": "accent",
  "auth.password_change": "warning",
  "mileage.add": "success",
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
      // We have the entity id but not slug here — link back to /entities
      // which already lists them all
      return `/entities`;
    case "mileage":
      return `/mileage`;
    case "user":
      return `/settings`;
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
