import Image from "next/image";
import Link from "next/link";
import {
  Page,
  PageHeader,
  StatTile,
  Card,
  StatusPill,
  SectionHeader,
  Money,
  EmptyState,
  Callout,
} from "@/components/ui";
import { db } from "@/lib/db";
import {
  entities,
  llcPaperwork,
  taxDeadlines,
} from "@/lib/db/schema";
import { getActiveScope } from "@/lib/scope";
import { asc, eq, sql, and, ne, lte, isNotNull } from "drizzle-orm";
import {
  accumulatedDepreciationCents,
  annualDepreciationCents,
  MACRS_LABEL,
} from "@/lib/depreciation";

export const dynamic = "force-dynamic";

const ENTITY_PHOTO: Record<string, string> = {
  "path-to-change": "/theledger-assets/entity-path-to-change.png",
  "ptc-havens": "/theledger-assets/entity-ptc-havens.png",
  "hl-place-of-grace": "/theledger-assets/entity-hl-place-of-grace.png",
  "hl-havens": "/theledger-assets/entity-hl-havens.png",
  cfs: "/theledger-assets/entity-cfs.png",
  "personal-joint": "/theledger-assets/emblem-wider.webp",
};

const PROPERTY_DOC_KINDS = [
  "deed",
  "mortgage_note",
  "insurance_policy",
  "lease_agreement",
];

const PROPERTY_DEADLINE_KINDS = [
  "property_tax",
  "insurance_renewal",
  "mortgage_due",
];

function daysUntil(dateISO: string, today: Date): number {
  const d = new Date(dateISO + "T00:00:00Z");
  return Math.round((d.getTime() - today.getTime()) / 86_400_000);
}

export default async function PropertiesPage() {
  const scope = await getActiveScope();
  const today = new Date();
  const todayISO = today.toISOString().slice(0, 10);

  const where = scope.entity
    ? and(eq(entities.id, scope.entity.id), isNotNull(entities.propertyAddress))!
    : isNotNull(entities.propertyAddress);

  const props = await db
    .select()
    .from(entities)
    .where(where)
    .orderBy(asc(entities.name));

  // Pull all property docs + upcoming deadlines for those entities in one go
  const entityIds = props.map((p) => p.id);
  const propertyDocs =
    entityIds.length === 0
      ? []
      : await db
          .select({
            entityId: llcPaperwork.entityId,
            docKind: llcPaperwork.docKind,
            expiresDate: llcPaperwork.expiresDate,
            filedDate: llcPaperwork.filedDate,
            blobUrl: llcPaperwork.blobUrl,
          })
          .from(llcPaperwork)
          .where(
            and(
              sql`${llcPaperwork.entityId} = ANY(${sql.raw(`ARRAY[${entityIds.map((id) => `'${id}'`).join(",")}]::uuid[]`)})`,
              sql`${llcPaperwork.docKind} = ANY(${sql.raw(`ARRAY[${PROPERTY_DOC_KINDS.map((k) => `'${k}'`).join(",")}]::text[]`)})`
            )
          );

  const upcomingPropertyDeadlines =
    entityIds.length === 0
      ? []
      : await db
          .select({
            entityId: taxDeadlines.entityId,
            kind: taxDeadlines.kind,
            dueDate: taxDeadlines.dueDate,
            notes: taxDeadlines.notes,
          })
          .from(taxDeadlines)
          .where(
            and(
              sql`${taxDeadlines.entityId} = ANY(${sql.raw(`ARRAY[${entityIds.map((id) => `'${id}'`).join(",")}]::uuid[]`)})`,
              sql`${taxDeadlines.kind} = ANY(${sql.raw(`ARRAY[${PROPERTY_DEADLINE_KINDS.map((k) => `'${k}'`).join(",")}]::text[]`)})`,
              ne(taxDeadlines.status, "paid")
            )
          )
          .orderBy(asc(taxDeadlines.dueDate));

  // Group by entityId for fast lookup
  const docsByEntity = new Map<string, typeof propertyDocs>();
  for (const d of propertyDocs) {
    const arr = docsByEntity.get(d.entityId!) ?? [];
    arr.push(d);
    docsByEntity.set(d.entityId!, arr);
  }
  const deadlinesByEntity = new Map<string, typeof upcomingPropertyDeadlines>();
  for (const d of upcomingPropertyDeadlines) {
    if (!d.entityId) continue;
    const arr = deadlinesByEntity.get(d.entityId) ?? [];
    arr.push(d);
    deadlinesByEntity.set(d.entityId, arr);
  }

  const totalBasis = props.reduce(
    (s, p) => s + (p.propertyPurchasePriceCents ?? 0),
    0
  );
  const propertiesWithDepreciation = props.filter(
    (p) => p.depreciationBasisCents && p.depreciationInServiceDate && p.depreciationMacrsClass
  ).length;
  const totalAnnualDepreciation = props.reduce(
    (s, p) =>
      s + (annualDepreciationCents(p.depreciationBasisCents, p.depreciationMacrsClass) ?? 0),
    0
  );

  return (
    <Page>
      <PageHeader
        title="Properties"
        subtitle={
          scope.entity
            ? `Scoped to ${scope.entity.name}.`
            : `${props.length} propert${props.length === 1 ? "y" : "ies"} across the family.`
        }
      />

      {props.length === 0 ? (
        <EmptyState
          title="No properties yet"
          description={
            scope.entity
              ? `${scope.entity.name} doesn't have a property address on file.`
              : "Add an address on /entities for any entity that owns property."
          }
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile
              label="Properties"
              value={props.length.toLocaleString()}
            />
            <StatTile
              label="Total basis"
              value={<Money cents={totalBasis} />}
              hint={
                totalBasis === 0
                  ? "Purchase prices not yet entered"
                  : undefined
              }
            />
            <StatTile
              label="Depreciation schedules"
              value={`${propertiesWithDepreciation} / ${props.length}`}
              tone={propertiesWithDepreciation === props.length ? "success" : "warning"}
            />
            <StatTile
              label="Annual deprec."
              value={<Money cents={totalAnnualDepreciation} />}
              hint="Straight-line MACRS approx"
            />
          </div>

          {propertiesWithDepreciation < props.length && (
            <Callout title="Depreciation gaps" tone="info">
              {props.length - propertiesWithDepreciation} propert
              {props.length - propertiesWithDepreciation === 1 ? "y" : "ies"}{" "}
              don&apos;t have basis + in-service date + MACRS class set.
              These figures aren&apos;t filing-grade — once the CPA finalizes
              the depreciation schedule, fill them in via SQL on the entities
              table (depreciation_basis_cents, depreciation_in_service_date,
              depreciation_macrs_class).
            </Callout>
          )}

          <div className="grid gap-5 lg:grid-cols-2">
            {props.map((p) => {
              const photo =
                ENTITY_PHOTO[p.slug] ?? "/theledger-assets/emblem-wider.webp";
              const docs = docsByEntity.get(p.id) ?? [];
              const deadlines = deadlinesByEntity.get(p.id) ?? [];

              const hasDeed = docs.some((d) => d.docKind === "deed");
              const hasMortgage = docs.some((d) => d.docKind === "mortgage_note");
              const insurance = docs
                .filter((d) => d.docKind === "insurance_policy")
                .sort((a, b) =>
                  (b.filedDate ?? "").localeCompare(a.filedDate ?? "")
                )[0];
              const insuranceDays = insurance?.expiresDate
                ? daysUntil(insurance.expiresDate, today)
                : null;
              const insExpired = insuranceDays != null && insuranceDays < 0;
              const insExpiringSoon =
                insuranceDays != null && insuranceDays >= 0 && insuranceDays <= 60;

              const annualDep = annualDepreciationCents(
                p.depreciationBasisCents,
                p.depreciationMacrsClass
              );
              const accDep = accumulatedDepreciationCents(
                p.depreciationBasisCents,
                p.depreciationMacrsClass,
                p.depreciationInServiceDate,
                today
              );
              const remaining =
                p.depreciationBasisCents != null && accDep != null
                  ? Math.max(0, p.depreciationBasisCents - accDep)
                  : null;

              return (
                <article
                  key={p.id}
                  className="rounded-2xl border border-[var(--border)] bg-white shadow-[0_8px_24px_rgba(15,23,42,0.06)] overflow-hidden"
                >
                  <Link href={`/entities/${p.slug}`} className="block">
                    <div className="relative h-56 bg-[var(--surface-warm)]">
                      <Image
                        src={photo}
                        alt={p.name}
                        fill
                        className="object-cover"
                        sizes="(min-width: 1024px) 50vw, 100vw"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-[#0f172a]/75 via-transparent to-transparent" />
                      <div className="absolute bottom-3 left-4 right-4 text-white">
                        <div className="flex flex-wrap gap-1.5 mb-1.5">
                          <StatusPill tone="success">{p.name}</StatusPill>
                          {p.rentalClassification &&
                            p.rentalClassification !== "n_a" && (
                              <StatusPill tone="warning">
                                {p.rentalClassification.toUpperCase()} rental
                              </StatusPill>
                            )}
                        </div>
                        <div className="font-display text-lg leading-snug truncate">
                          {p.propertyAddress}
                        </div>
                      </div>
                    </div>
                  </Link>

                  <div className="px-5 py-4 space-y-4">
                    {/* Purchase */}
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                          Purchase price
                        </div>
                        <div className="mt-0.5 font-medium">
                          {p.propertyPurchasePriceCents ? (
                            <Money cents={p.propertyPurchasePriceCents} />
                          ) : (
                            <span className="text-[var(--muted)]">—</span>
                          )}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                          Purchase date
                        </div>
                        <div className="mt-0.5 font-medium tabular">
                          {p.propertyPurchaseDate ?? (
                            <span className="text-[var(--muted)]">—</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Status badges */}
                    <div className="flex flex-wrap gap-1.5">
                      <StatusPill tone={hasDeed ? "success" : "warning"}>
                        {hasDeed ? "Deed ✓" : "Deed missing"}
                      </StatusPill>
                      <StatusPill tone={hasMortgage ? "success" : "neutral"}>
                        {hasMortgage ? "Mortgage on file" : "No mortgage doc"}
                      </StatusPill>
                      {insurance ? (
                        insExpired ? (
                          <StatusPill tone="danger">
                            Insurance expired{" "}
                            {insuranceDays != null
                              ? `${Math.abs(insuranceDays)}d ago`
                              : ""}
                          </StatusPill>
                        ) : insExpiringSoon ? (
                          <StatusPill tone="warning">
                            Insurance expires in {insuranceDays}d
                          </StatusPill>
                        ) : (
                          <StatusPill tone="success">Insurance ✓</StatusPill>
                        )
                      ) : (
                        <StatusPill tone="warning">No insurance on file</StatusPill>
                      )}
                    </div>

                    {/* Depreciation */}
                    {p.depreciationBasisCents && p.depreciationMacrsClass ? (
                      <div className="rounded-lg bg-[var(--surface-warm)] px-4 py-3">
                        <div className="flex items-baseline justify-between gap-2 mb-2">
                          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                            Depreciation
                          </div>
                          <div className="text-xs text-[var(--muted)]">
                            {MACRS_LABEL[p.depreciationMacrsClass] ??
                              p.depreciationMacrsClass}
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-sm">
                          <div>
                            <div className="text-[10px] text-[var(--muted)]">
                              Annual
                            </div>
                            <div className="font-medium">
                              <Money cents={annualDep ?? 0} />
                            </div>
                          </div>
                          <div>
                            <div className="text-[10px] text-[var(--muted)]">
                              Accumulated
                            </div>
                            <div className="font-medium">
                              <Money cents={accDep ?? 0} />
                            </div>
                          </div>
                          <div>
                            <div className="text-[10px] text-[var(--muted)]">
                              Remaining basis
                            </div>
                            <div className="font-medium">
                              <Money cents={remaining ?? 0} />
                            </div>
                          </div>
                        </div>
                        {p.depreciationInServiceDate && (
                          <div className="mt-2 text-[10px] text-[var(--muted)]">
                            In service{" "}
                            <span className="tabular">
                              {p.depreciationInServiceDate}
                            </span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="rounded-lg border border-dashed border-[var(--border)] px-4 py-3 text-xs text-[var(--muted)]">
                        Depreciation not yet configured. Set
                        depreciation_basis_cents, depreciation_in_service_date,
                        and depreciation_macrs_class on the entity.
                      </div>
                    )}

                    {/* Deadlines */}
                    {deadlines.length > 0 && (
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)] mb-1.5">
                          Upcoming
                        </div>
                        <ul className="space-y-1 text-sm">
                          {deadlines.slice(0, 3).map((d, i) => {
                            const days = daysUntil(d.dueDate, today);
                            return (
                              <li
                                key={i}
                                className="flex items-baseline justify-between gap-2"
                              >
                                <span className="capitalize text-[var(--body)]">
                                  {d.kind.replace(/_/g, " ")}
                                </span>
                                <span className="text-xs text-[var(--muted)] tabular">
                                  {d.dueDate} · in {days}d
                                </span>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    )}

                    <div className="pt-1 text-right">
                      <Link
                        href={`/entities/${p.slug}`}
                        className="text-xs text-[var(--accent)] hover:underline"
                      >
                        Open entity →
                      </Link>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}
    </Page>
  );
}
