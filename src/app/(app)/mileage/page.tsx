import Link from "next/link";
import {
  Page,
  PageHeader,
  StatTile,
  Card,
  SectionHeader,
  EmptyState,
  Money,
  Callout,
} from "@/components/ui";
import { db } from "@/lib/db";
import { mileageEntries, entities, users } from "@/lib/db/schema";
import { getActiveScope } from "@/lib/scope";
import { asc, desc, eq, sql, and, gte, lte } from "drizzle-orm";
import { mileageRatePerMile } from "@/lib/tax-constants";
import { MileageForm, DeleteMileageBtn } from "./_client";

export const dynamic = "force-dynamic";

type SP = Promise<{ year?: string }>;

function parseYear(raw: string | undefined): number {
  const cur = new Date().getFullYear();
  const n = Number(raw);
  return Number.isFinite(n) && n >= 2000 && n <= cur + 1 ? Math.floor(n) : cur;
}

export default async function MileagePage({
  searchParams,
}: {
  searchParams: SP;
}) {
  const sp = await searchParams;
  const year = parseYear(sp.year);
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  const scope = await getActiveScope();
  const todayISO = new Date().toISOString().slice(0, 10);
  const ratePerMile = mileageRatePerMile(year);

  const entityList = await db
    .select({ id: entities.id, name: entities.name })
    .from(entities)
    .orderBy(asc(entities.name));
  const defaultEntityId = scope.entity?.id ?? entityList[0]?.id ?? "";

  const where = scope.entity ? eq(mileageEntries.entityId, scope.entity.id) : undefined;

  const [yearStats] = await db
    .select({
      count: sql<number>`coalesce(count(*), 0)::int`,
      miles: sql<number>`coalesce(sum(miles), 0)::real`,
    })
    .from(mileageEntries)
    .where(
      and(
        where,
        gte(mileageEntries.tripDate, yearStart),
        lte(mileageEntries.tripDate, yearEnd)
      )!
    );

  const perEntity = await db
    .select({
      entityName: entities.name,
      entityId: entities.id,
      count: sql<number>`coalesce(count(${mileageEntries.id}), 0)::int`,
      miles: sql<number>`coalesce(sum(${mileageEntries.miles}), 0)::real`,
    })
    .from(entities)
    .leftJoin(
      mileageEntries,
      and(
        eq(mileageEntries.entityId, entities.id),
        gte(mileageEntries.tripDate, yearStart),
        lte(mileageEntries.tripDate, yearEnd)
      )
    )
    .groupBy(entities.id, entities.name)
    .having(sql`coalesce(sum(${mileageEntries.miles}), 0) > 0`)
    .orderBy(desc(sql`coalesce(sum(${mileageEntries.miles}), 0)`));

  const recent = await db
    .select({
      id: mileageEntries.id,
      tripDate: mileageEntries.tripDate,
      miles: mileageEntries.miles,
      vehicleLabel: mileageEntries.vehicleLabel,
      startLocation: mileageEntries.startLocation,
      endLocation: mileageEntries.endLocation,
      businessPurpose: mileageEntries.businessPurpose,
      entityName: entities.name,
      enteredBy: users.name,
    })
    .from(mileageEntries)
    .innerJoin(entities, eq(entities.id, mileageEntries.entityId))
    .innerJoin(users, eq(users.id, mileageEntries.enteredByUserId))
    .where(where!)
    .orderBy(desc(mileageEntries.tripDate), desc(mileageEntries.createdAt))
    .limit(40);

  const deductionCents = Math.round(yearStats.miles * ratePerMile);
  const yearOptions = (() => {
    const cur = new Date().getFullYear();
    return [cur, cur - 1, cur - 2];
  })();

  return (
    <Page>
      <PageHeader
        title={`Mileage — ${year}`}
        subtitle={
          scope.entity
            ? `Scoped to ${scope.entity.name}.`
            : "All entities. IRS standard-rate deduction estimate per year."
        }
        actions={
          <div className="flex gap-1">
            {yearOptions.map((y) => (
              <Link
                key={y}
                href={`/mileage?year=${y}`}
                className={`rounded-full border border-[var(--border)] px-4 py-1.5 text-sm font-semibold ${
                  y === year
                    ? "bg-[var(--foreground)] text-white"
                    : "hover:bg-[var(--surface-warm)] transition-colors"
                }`}
              >
                {y}
              </Link>
            ))}
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile
          label={`Trips ${year}`}
          value={yearStats.count.toLocaleString()}
        />
        <StatTile
          label="Business miles"
          value={yearStats.miles.toFixed(1)}
          hint={`${ratePerMile}¢/mi IRS standard ${year}`}
        />
        <StatTile
          label="Deduction estimate"
          value={<Money cents={deductionCents} />}
          tone="success"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* LEFT: per-entity + recent */}
        <div className="space-y-6">
          {perEntity.length > 0 && (
            <section>
              <SectionHeader title="Per entity" />
              <Card>
                <ul className="divide-y divide-[var(--border)] text-sm">
                  {perEntity.map((e) => {
                    const ded = Math.round(e.miles * ratePerMile);
                    return (
                      <li
                        key={e.entityId}
                        className="px-5 py-3 flex items-baseline justify-between gap-3"
                      >
                        <span className="font-medium">{e.entityName}</span>
                        <div className="text-right">
                          <div className="tabular">
                            {e.miles.toFixed(1)} mi · {e.count} trip
                            {e.count === 1 ? "" : "s"}
                          </div>
                          <div className="text-xs text-[var(--accent)]">
                            <Money cents={ded} /> deduction
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            </section>
          )}

          <section>
            <SectionHeader title="Recent trips" />
            {recent.length === 0 ? (
              <EmptyState
                title="No trips logged yet"
                description="Log Heather's CFS cleaning trips or Path-to-Change client drives from the form on the right."
              />
            ) : (
              <Card>
                <ul className="divide-y divide-[var(--border)] text-sm">
                  {recent.map((r) => (
                    <li
                      key={r.id}
                      className="px-5 py-3 flex items-start justify-between gap-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2">
                          <span className="tabular text-xs text-[var(--muted)] w-20 shrink-0">
                            {r.tripDate}
                          </span>
                          <span className="font-semibold tabular">
                            {r.miles.toFixed(1)} mi
                          </span>
                          {r.vehicleLabel && (
                            <span className="text-xs text-[var(--muted)]">
                              · {r.vehicleLabel}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-[var(--body)] mt-0.5">
                          {[r.startLocation, r.endLocation]
                            .filter(Boolean)
                            .join(" → ") || "—"}
                        </div>
                        {r.businessPurpose && (
                          <div className="text-xs text-[var(--muted)] mt-0.5">
                            {r.businessPurpose}
                          </div>
                        )}
                        <div className="text-[10px] uppercase tracking-[0.14em] text-[var(--muted)] mt-1">
                          {r.entityName} · by {r.enteredBy}
                        </div>
                      </div>
                      <DeleteMileageBtn id={r.id} />
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </section>
        </div>

        {/* RIGHT: log form */}
        <aside className="space-y-4 lg:sticky lg:top-24 h-fit">
          <SectionHeader title="Log a trip" />
          <Card className="p-5">
            <MileageForm
              entities={entityList}
              defaultEntityId={defaultEntityId}
              todayISO={todayISO}
            />
          </Card>
          <Callout tone="info">
            IRS standard mileage rate {year}: <strong>{ratePerMile}¢/mi</strong>{" "}
            for business use. (2026 rate uses 2025 as a placeholder until the
            IRS publishes the final figure in late December.)
          </Callout>
        </aside>
      </div>
    </Page>
  );
}
