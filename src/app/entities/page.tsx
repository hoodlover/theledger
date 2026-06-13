import Image from "next/image";
import {
  Page,
  PageHeader,
  StatusPill,
  EmptyState,
} from "@/components/ui";
import { db } from "@/lib/db";
import { entities } from "@/lib/db/schema";
import { getActiveScope } from "@/lib/scope";
import { asc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

const KIND_LABEL: Record<string, string> = {
  s_corp: "S-Corporation",
  llc: "Limited Liability Co.",
  sole_prop: "Sole Proprietorship",
  individual: "Personal · Joint",
};

const ENTITY_PHOTO: Record<string, string> = {
  "path-to-change": "/theledger-assets/entity-path-to-change.png",
  "ptc-havens": "/theledger-assets/entity-ptc-havens.png",
  "hl-place-of-grace": "/theledger-assets/entity-hl-place-of-grace.png",
  "hl-havens": "/theledger-assets/entity-hl-havens.png",
  cfs: "/theledger-assets/entity-cfs.png",
  "personal-joint": "/theledger-assets/emblem-wider.webp",
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
            : `${rows.length} entities under management.`
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          title="No entities yet"
          description="Run npm run db:seed to insert the six entities from BRIEF.md."
        />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((e) => {
            const photo =
              ENTITY_PHOTO[e.slug] ?? "/theledger-assets/emblem-wider.webp";
            return (
              <article
                key={e.id}
                className="rounded-2xl border border-[var(--border)] bg-white shadow-[0_8px_24px_rgba(15,23,42,0.06)] overflow-hidden transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_16px_36px_rgba(15,23,42,0.10)]"
              >
                <div className="relative h-48 bg-[var(--surface-warm)]">
                  <Image
                    src={photo}
                    alt={e.name}
                    fill
                    className="object-cover"
                    sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-black/10 to-transparent" />
                  <div className="absolute bottom-3 left-4 right-4 flex items-end justify-between gap-2">
                    <StatusPill tone="success">
                      {KIND_LABEL[e.kind] ?? e.kind}
                    </StatusPill>
                    {e.rentalClassification &&
                      e.rentalClassification !== "n_a" && (
                        <StatusPill tone="warning">
                          {e.rentalClassification.toUpperCase()} rental
                        </StatusPill>
                      )}
                  </div>
                </div>
                <div className="px-5 py-4 space-y-2">
                  <div className="font-display text-lg leading-snug">
                    {e.name}
                  </div>

                  {e.propertyAddress && (
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                        Property
                      </div>
                      <div className="text-sm text-[var(--body)] mt-0.5">
                        {e.propertyAddress}
                      </div>
                    </div>
                  )}

                  {e.mailingAddress && e.mailingAddress !== e.propertyAddress && (
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                        Mailing
                      </div>
                      <div className="text-sm text-[var(--body)] mt-0.5">
                        {e.mailingAddress}
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-3 pt-1 text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">
                    {e.ein && <span>EIN {e.ein}</span>}
                    {e.state && <span>· {e.state}</span>}
                    {e.phone && <span>· {e.phone}</span>}
                  </div>

                  {e.notes && (
                    <div className="text-xs text-[var(--muted)] pt-1 line-clamp-3">
                      {e.notes}
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </Page>
  );
}
