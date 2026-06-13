import Image from "next/image";
import Link from "next/link";
import {
  Page,
  PageHeader,
  StatTile,
  Card,
  SectionHeader,
  StatusPill,
  EmptyState,
} from "@/components/ui";
import { db } from "@/lib/db";
import { entities, llcPaperwork } from "@/lib/db/schema";
import { getActiveScope } from "@/lib/scope";
import { eq, desc, sql, asc } from "drizzle-orm";
import { DOC_KIND_LABEL, DOC_KIND_GROUP } from "@/lib/doc-kinds";
import { DocumentUploadForm } from "./_upload-form";
import { DocRow } from "./_doc-row";

export const dynamic = "force-dynamic";

const ENTITY_PHOTO: Record<string, string> = {
  "path-to-change": "/theledger-assets/entity-path-to-change.png",
  "ptc-havens": "/theledger-assets/entity-ptc-havens.png",
  "hl-place-of-grace": "/theledger-assets/entity-hl-place-of-grace.png",
  "hl-havens": "/theledger-assets/entity-hl-havens.png",
  cfs: "/theledger-assets/entity-cfs.png",
  "personal-joint": "/theledger-assets/emblem-wider.webp",
};

function daysUntil(dateISO: string, today: Date): number {
  const d = new Date(dateISO + "T00:00:00Z");
  return Math.round((d.getTime() - today.getTime()) / 86_400_000);
}

export default async function DocsPage() {
  const scope = await getActiveScope();
  const today = new Date();
  const todayISO = today.toISOString().slice(0, 10);

  const entitiesList = await db
    .select({ id: entities.id, slug: entities.slug, name: entities.name })
    .from(entities)
    .orderBy(asc(entities.name));

  const where = scope.entity
    ? eq(llcPaperwork.entityId, scope.entity.id)
    : undefined;

  const allDocs = await db
    .select({
      doc: llcPaperwork,
      entitySlug: entities.slug,
      entityName: entities.name,
    })
    .from(llcPaperwork)
    .innerJoin(entities, eq(entities.id, llcPaperwork.entityId))
    .where(where!)
    .orderBy(desc(llcPaperwork.filedDate));

  // Per-entity counts
  const docsByEntity = new Map<string, typeof allDocs>();
  for (const row of allDocs) {
    const list = docsByEntity.get(row.entitySlug) ?? [];
    list.push(row);
    docsByEntity.set(row.entitySlug, list);
  }

  const expiringSoon = allDocs.filter(
    (r) =>
      r.doc.expiresDate &&
      daysUntil(r.doc.expiresDate, today) >= 0 &&
      daysUntil(r.doc.expiresDate, today) <= 60
  ).length;
  const expired = allDocs.filter(
    (r) => r.doc.expiresDate && daysUntil(r.doc.expiresDate, today) < 0
  ).length;

  const defaultEntityId = scope.entity?.id ?? entitiesList[0]?.id ?? "";

  // Folders to display — when scoped, just that entity; else all entities
  const folderList = scope.entity
    ? entitiesList.filter((e) => e.id === scope.entity!.id)
    : entitiesList;

  return (
    <Page>
      <PageHeader
        title="Documents"
        subtitle="Operating agreements, EIN letters, deeds, leases, insurance, mortgage notes, annual reports — every paper trail per entity."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Documents" value={allDocs.length.toLocaleString()} />
        <StatTile
          label="Expiring (60 d)"
          value={expiringSoon.toLocaleString()}
          tone={expiringSoon > 0 ? "warning" : "neutral"}
        />
        <StatTile
          label="Expired"
          value={expired.toLocaleString()}
          tone={expired > 0 ? "danger" : "neutral"}
        />
        <StatTile
          label="Entities tracked"
          value={folderList.length.toLocaleString()}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* LEFT: folder list */}
        <div className="space-y-8">
          {folderList.map((e) => {
            const docs = docsByEntity.get(e.slug) ?? [];
            const photo =
              ENTITY_PHOTO[e.slug] ?? "/theledger-assets/emblem-wider.webp";

            // Group docs by DOC_KIND_GROUP
            const grouped = new Map<string, typeof docs>();
            for (const r of docs) {
              const group = DOC_KIND_GROUP[r.doc.docKind] ?? "Other";
              const arr = grouped.get(group) ?? [];
              arr.push(r);
              grouped.set(group, arr);
            }

            return (
              <section key={e.id}>
                <div className="flex items-center gap-3 mb-3">
                  <Link
                    href={`/entities/${e.slug}`}
                    className="relative h-12 w-12 rounded-lg overflow-hidden shrink-0 bg-[var(--surface-warm)] border border-[var(--border)]"
                  >
                    <Image
                      src={photo}
                      alt={e.name}
                      fill
                      className="object-cover"
                      sizes="48px"
                    />
                  </Link>
                  <div className="flex-1 min-w-0">
                    <div className="font-display text-lg leading-snug">
                      <Link
                        href={`/entities/${e.slug}`}
                        className="hover:underline"
                      >
                        {e.name}
                      </Link>
                    </div>
                    <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                      {docs.length} document{docs.length === 1 ? "" : "s"}
                    </div>
                  </div>
                </div>

                {docs.length === 0 ? (
                  <Card
                    tone="warm"
                    className="px-5 py-6 text-sm text-[var(--muted)]"
                  >
                    No documents yet for {e.name}. Use the upload panel on the
                    right to add the operating agreement, EIN letter, insurance
                    policy, or any other paper trail.
                  </Card>
                ) : (
                  <div className="space-y-4">
                    {[...grouped.entries()].map(([group, items]) => (
                      <div key={group}>
                        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)] mb-1.5">
                          {group}
                        </div>
                        <Card>
                          <div className="divide-y divide-[var(--border)]">
                            {items.map((r) => {
                              const label =
                                DOC_KIND_LABEL[r.doc.docKind] ?? r.doc.docKind;
                              const meta = [
                                r.doc.filedDate
                                  ? `Filed ${r.doc.filedDate}`
                                  : null,
                                r.doc.expiresDate
                                  ? `Expires ${r.doc.expiresDate}`
                                  : null,
                              ]
                                .filter(Boolean)
                                .join(" · ");
                              const expIn = r.doc.expiresDate
                                ? daysUntil(r.doc.expiresDate, today)
                                : null;
                              return (
                                <DocRow
                                  key={r.doc.id}
                                  id={r.doc.id}
                                  label={label}
                                  href={r.doc.blobUrl}
                                  meta={meta || "No dates"}
                                  expiringIn={expIn}
                                  notes={r.doc.notes}
                                />
                              );
                            })}
                          </div>
                        </Card>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>

        {/* RIGHT: upload panel */}
        <aside className="lg:sticky lg:top-24 h-fit">
          <SectionHeader title="Upload" />
          <Card className="p-5">
            <DocumentUploadForm
              entities={entitiesList}
              defaultEntityId={defaultEntityId}
            />
          </Card>

          {allDocs.length > 0 && (
            <div className="mt-6">
              <SectionHeader title="Recent" />
              <Card>
                <ul className="divide-y divide-[var(--border)]">
                  {allDocs.slice(0, 6).map((r) => (
                    <li key={r.doc.id} className="px-5 py-3 text-sm">
                      <a
                        href={r.doc.blobUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block hover:underline"
                      >
                        <div className="font-medium">
                          {DOC_KIND_LABEL[r.doc.docKind] ?? r.doc.docKind}
                        </div>
                        <div className="text-xs text-[var(--muted)]">
                          {r.entityName}
                          {r.doc.filedDate ? ` · filed ${r.doc.filedDate}` : ""}
                        </div>
                      </a>
                    </li>
                  ))}
                </ul>
              </Card>
            </div>
          )}
        </aside>
      </div>
    </Page>
  );
}
