import Image from "next/image";
import Link from "next/link";
import {
  Page,
  StatTile,
  Card,
  Money,
  SectionHeader,
  StatusPill,
} from "@/components/ui";
import { db } from "@/lib/db";
import {
  entities,
  bankAccounts,
  transactions,
  taxDeadlines,
  receipts,
  contractors,
  employees,
} from "@/lib/db/schema";
import { getActiveScope } from "@/lib/scope";
import { eq, and, count, sql, ne, lte } from "drizzle-orm";

export const dynamic = "force-dynamic";

// Property photo per entity (in /public/theledger-assets/).
// Where a property photo doesn't exist, fall back to the wide emblem.
const ENTITY_PHOTO: Record<string, string> = {
  "path-to-change": "/theledger-assets/entity-path-to-change.png",
  "ptc-havens": "/theledger-assets/entity-path-to-change-2.png",
  "hl-place-of-grace": "/theledger-assets/entity-hl-place-of-grace.webp",
  "hl-havens": "/theledger-assets/entity-hl-place-of-grace.webp",
  cfs: "/theledger-assets/entity-cfs.png",
  "personal-joint": "/theledger-assets/emblem-wider.webp",
};

const ENTITY_KIND_LABEL: Record<string, string> = {
  s_corp: "S-Corporation",
  llc: "Limited Liability Co.",
  sole_prop: "Sole Proprietorship",
  individual: "Personal · Joint",
};

export default async function Home() {
  const scope = await getActiveScope();
  const todayISO = new Date().toISOString().slice(0, 10);
  const yearStart = `${new Date().getFullYear()}-01-01`;

  const entityFilter = scope.entity
    ? eq(transactions.entityId, scope.entity.id)
    : undefined;

  const [
    [{ value: entityCount }],
    [{ value: accountCount }],
    [{ value: txnCount }],
    [{ value: receiptCount }],
    [{ value: contractorCount }],
    [{ value: employeeCount }],
    [{ value: openDeadlineCount }],
    [{ value: overdueDeadlineCount }],
    [stats],
    entityRows,
  ] = await Promise.all([
    db.select({ value: count() }).from(entities),
    scope.entity
      ? db
          .select({ value: count() })
          .from(bankAccounts)
          .where(eq(bankAccounts.entityId, scope.entity.id))
      : db.select({ value: count() }).from(bankAccounts),
    scope.entity
      ? db.select({ value: count() }).from(transactions).where(entityFilter!)
      : db.select({ value: count() }).from(transactions),
    scope.entity
      ? db
          .select({ value: count() })
          .from(receipts)
          .where(eq(receipts.entityId, scope.entity.id))
      : db.select({ value: count() }).from(receipts),
    scope.entity
      ? db
          .select({ value: count() })
          .from(contractors)
          .where(eq(contractors.entityId, scope.entity.id))
      : db.select({ value: count() }).from(contractors),
    scope.entity
      ? db
          .select({ value: count() })
          .from(employees)
          .where(eq(employees.entityId, scope.entity.id))
      : db.select({ value: count() }).from(employees),
    scope.entity
      ? db
          .select({ value: count() })
          .from(taxDeadlines)
          .where(
            and(
              eq(taxDeadlines.entityId, scope.entity.id),
              ne(taxDeadlines.status, "paid")
            )
          )
      : db
          .select({ value: count() })
          .from(taxDeadlines)
          .where(ne(taxDeadlines.status, "paid")),
    scope.entity
      ? db
          .select({ value: count() })
          .from(taxDeadlines)
          .where(
            and(
              eq(taxDeadlines.entityId, scope.entity.id),
              ne(taxDeadlines.status, "paid"),
              lte(taxDeadlines.dueDate, todayISO)
            )
          )
      : db
          .select({ value: count() })
          .from(taxDeadlines)
          .where(
            and(
              ne(taxDeadlines.status, "paid"),
              lte(taxDeadlines.dueDate, todayISO)
            )
          ),
    db
      .select({
        inflow: sql<number>`coalesce(sum(case when ${transactions.amountCents} > 0 then ${transactions.amountCents} else 0 end), 0)::int`,
        outflow: sql<number>`coalesce(sum(case when ${transactions.amountCents} < 0 then -${transactions.amountCents} else 0 end), 0)::int`,
        net: sql<number>`coalesce(sum(${transactions.amountCents}), 0)::int`,
      })
      .from(transactions)
      .where(
        and(
          scope.entity ? eq(transactions.entityId, scope.entity.id) : undefined,
          sql`${transactions.postedDate} >= ${yearStart}`
        )!
      ),
    db
      .select({
        id: entities.id,
        slug: entities.slug,
        name: entities.name,
        kind: entities.kind,
        mailingAddress: entities.mailingAddress,
        propertyAddress: entities.propertyAddress,
        ein: entities.ein,
      })
      .from(entities),
  ]);

  return (
    <Page>
      {/* ───── Hero ───── */}
      <section className="relative overflow-hidden rounded-3xl border border-[var(--border)] bg-white shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
        <div className="grid lg:grid-cols-[1.05fr_0.95fr] gap-0">
          <div className="px-8 sm:px-12 py-12 lg:py-16 flex flex-col justify-center">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--accent)] mb-4">
              Cobb Family Legacy
            </div>
            <h1 className="font-display text-4xl sm:text-5xl leading-[1.05] tracking-tight">
              Six Entities. One Ledger.
            </h1>
            <p className="mt-5 text-base sm:text-lg text-[var(--body)] max-w-xl">
              Complete visibility across your businesses, properties, and
              people. Every dollar reconciled to its entity — every payment to
              its purpose.
            </p>
            <div className="mt-7 flex flex-wrap gap-2">
              <Link
                href="/transactions"
                className="inline-flex items-center gap-2 rounded-full bg-[var(--foreground)] text-white px-5 py-2.5 text-sm font-semibold hover:-translate-y-0.5 transition-all duration-200 hover:shadow-[0_8px_24px_rgba(15,23,42,0.20)]"
              >
                Open ledger
              </Link>
              <Link
                href="/quick-entry"
                className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] px-5 py-2.5 text-sm font-semibold hover:bg-[var(--surface-warm)] transition-colors"
              >
                Quick entry
              </Link>
            </div>
          </div>
          <div className="relative min-h-[280px] lg:min-h-[420px] bg-[var(--surface-warm)]">
            <Image
              src="/theledger-assets/emblem-wider.png"
              alt="The Ledger — Cobb Family Legacy"
              fill
              priority
              className="object-contain p-12"
            />
          </div>
        </div>
      </section>

      {/* ───── KPI strip ───── */}
      <section>
        <SectionHeader
          title="Year to date"
          hint={
            scope.entity
              ? `Scoped to ${scope.entity.name}`
              : "All entities combined"
          }
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            label="Inflow"
            value={<Money cents={stats.inflow} />}
            tone="success"
            hint={`${txnCount.toLocaleString()} transactions`}
          />
          <StatTile
            label="Outflow"
            value={<Money cents={stats.outflow} />}
            tone="danger"
          />
          <StatTile
            label="Net"
            value={<Money cents={stats.net} signed />}
            tone={stats.net >= 0 ? "success" : "danger"}
          />
          <StatTile
            label="Open deadlines"
            value={openDeadlineCount.toLocaleString()}
            tone={overdueDeadlineCount > 0 ? "danger" : "warning"}
            hint={
              overdueDeadlineCount > 0
                ? `${overdueDeadlineCount} overdue`
                : "On track"
            }
          />
        </div>
      </section>

      {/* ───── People + accounts counts ───── */}
      <section>
        <SectionHeader title="Roster" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile label="Entities" value={entityCount} hint="Cobb family" />
          <StatTile
            label="Accounts"
            value={accountCount}
            hint="Bluevine · BofA · Axos · AMEX"
          />
          <StatTile
            label="Contractors"
            value={contractorCount}
            hint="On file for 1099-NEC"
          />
          <StatTile
            label="Employees"
            value={employeeCount}
            hint="W-2 + minor child"
          />
        </div>
      </section>

      {/* ───── Entity cards ───── */}
      <section>
        <SectionHeader
          title="Entities"
          hint={
            <Link
              href="/entities"
              className="hover:underline text-[var(--accent)]"
            >
              View all →
            </Link>
          }
        />
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {entityRows.map((e) => (
            <EntityCard key={e.id} entity={e} />
          ))}
        </div>
      </section>
    </Page>
  );
}

function EntityCard({
  entity,
}: {
  entity: {
    id: string;
    slug: string;
    name: string;
    kind: string;
    mailingAddress: string | null;
    propertyAddress: string | null;
    ein: string | null;
  };
}) {
  const photo =
    ENTITY_PHOTO[entity.slug] ?? "/theledger-assets/emblem-wider.webp";
  const kindLabel = ENTITY_KIND_LABEL[entity.kind] ?? entity.kind;
  const addr = entity.propertyAddress ?? entity.mailingAddress;

  return (
    <Link
      href={`/entities`}
      className="group block rounded-2xl border border-[var(--border)] bg-white shadow-[0_8px_24px_rgba(15,23,42,0.06)] overflow-hidden transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_16px_36px_rgba(15,23,42,0.10)]"
    >
      <div className="relative h-44 bg-[var(--surface-warm)]">
        <Image
          src={photo}
          alt={entity.name}
          fill
          className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-transparent" />
        <div className="absolute bottom-3 left-4 right-4">
          <StatusPill tone="success">
            {kindLabel}
          </StatusPill>
        </div>
      </div>
      <div className="px-5 py-4">
        <div className="font-display text-lg leading-snug">{entity.name}</div>
        {addr && (
          <div className="mt-1 text-xs text-[var(--muted)] line-clamp-1">
            {addr}
          </div>
        )}
        {entity.ein && (
          <div className="mt-2 text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">
            EIN {entity.ein}
          </div>
        )}
      </div>
    </Link>
  );
}
