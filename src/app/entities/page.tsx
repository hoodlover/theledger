import {
  Page,
  PageHeader,
  Card,
  CardBody,
  StatusPill,
  EmptyState,
} from "@/components/ui";
import { db } from "@/lib/db";
import { entities } from "@/lib/db/schema";
import { getActiveScope } from "@/lib/scope";
import { asc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

const KIND_LABEL: Record<string, string> = {
  s_corp: "S-corp",
  llc: "LLC",
  sole_prop: "Sole prop",
  individual: "Individual",
};

export default async function EntitiesPage() {
  const scope = await getActiveScope();
  const rows = scope.entity
    ? await db
        .select()
        .from(entities)
        .where(eq(entities.id, scope.entity.id))
    : await db.select().from(entities).orderBy(asc(entities.name));

  return (
    <Page>
      <PageHeader
        title="Entities"
        subtitle={
          scope.entity
            ? `Scoped — showing 1 entity.`
            : `${rows.length} entities seeded.`
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          title="No entities yet"
          description="Run npm run db:seed to insert the six entities from BRIEF.md."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {rows.map((e) => (
            <Card key={e.id}>
              <CardBody>
                <div className="flex items-baseline justify-between gap-3">
                  <div className="font-semibold">{e.name}</div>
                  <StatusPill tone="accent">
                    {KIND_LABEL[e.kind] ?? e.kind}
                  </StatusPill>
                </div>
                {(e.state || e.ein) && (
                  <div className="mt-1 text-xs text-[var(--muted)]">
                    {[e.state, e.ein].filter(Boolean).join(" · ")}
                  </div>
                )}
                {e.propertyAddress && (
                  <div className="mt-3 text-sm">
                    <div className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
                      Property
                    </div>
                    <div className="mt-1">{e.propertyAddress}</div>
                    {e.rentalClassification &&
                      e.rentalClassification !== "n_a" && (
                        <StatusPill tone="neutral">
                          {e.rentalClassification.toUpperCase()}
                        </StatusPill>
                      )}
                  </div>
                )}
                {e.notes && (
                  <div className="mt-3 text-sm text-[var(--muted)]">
                    {e.notes}
                  </div>
                )}
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </Page>
  );
}
