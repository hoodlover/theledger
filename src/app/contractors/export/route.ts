import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { contractors, transactions, entities } from "@/lib/db/schema";
import { and, eq, gte, lte, sql, asc } from "drizzle-orm";

export const dynamic = "force-dynamic";

function csvCell(v: unknown): string {
  if (v == null) return "";
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function row(values: unknown[]): string {
  return values.map(csvCell).join(",");
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const entitySlug = url.searchParams.get("entity");
  const now = new Date();
  const cur = now.getFullYear();
  const yearParam = Number(url.searchParams.get("year"));
  const year =
    Number.isFinite(yearParam) && yearParam >= 2000 && yearParam <= cur + 1
      ? Math.floor(yearParam)
      : cur;
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;

  // Resolve entity scope from URL (don't use cookie — CSV exports should
  // be deterministic per URL so they can be linked from elsewhere).
  let entityFilter;
  if (entitySlug) {
    const [e] = await db
      .select({ id: entities.id })
      .from(entities)
      .where(eq(entities.slug, entitySlug));
    if (!e) {
      return new Response(`Unknown entity slug: ${entitySlug}`, { status: 400 });
    }
    entityFilter = eq(contractors.entityId, e.id);
  }

  const rows = await db
    .select({
      legalName: contractors.legalName,
      dba: contractors.dba,
      einOrSsn: contractors.einOrSsnEncrypted,
      address: contractors.address,
      entityName: entities.name,
      entityEin: entities.ein,
      entityAddress: entities.mailingAddress,
      entityPhone: entities.phone,
      paidCents: sql<number>`coalesce(sum(case when ${transactions.amountCents} < 0 then -${transactions.amountCents} else 0 end), 0)::int`,
      txnCount: sql<number>`coalesce(count(${transactions.id}), 0)::int`,
    })
    .from(contractors)
    .innerJoin(entities, eq(entities.id, contractors.entityId))
    .leftJoin(
      transactions,
      and(
        eq(transactions.contractorId, contractors.id),
        gte(transactions.postedDate, yearStart),
        lte(transactions.postedDate, yearEnd)
      )
    )
    .where(entityFilter!)
    .groupBy(
      contractors.id,
      contractors.legalName,
      contractors.dba,
      contractors.einOrSsnEncrypted,
      contractors.address,
      entities.name,
      entities.ein,
      entities.mailingAddress,
      entities.phone
    )
    .orderBy(asc(entities.name), asc(contractors.legalName));

  // Tax1099 / Track1099-style header. Lance can re-map columns in their
  // CSV importer; this keeps the obvious 1099-NEC fields named clearly.
  const headers = [
    "tax_year",
    "form",
    "payer_name",
    "payer_ein",
    "payer_address",
    "payer_phone",
    "recipient_name",
    "recipient_dba",
    "recipient_tin",
    "recipient_address",
    "box_1_nonemployee_compensation",
    "payment_count",
  ];

  const lines = [row(headers)];
  for (const r of rows) {
    if (r.paidCents <= 0) continue; // skip $0 contractors
    lines.push(
      row([
        year,
        "1099-NEC",
        r.entityName,
        r.entityEin ?? "",
        r.entityAddress ?? "",
        r.entityPhone ?? "",
        r.legalName,
        r.dba ?? "",
        r.einOrSsn ?? "",
        r.address ?? "",
        (r.paidCents / 100).toFixed(2),
        r.txnCount,
      ])
    );
  }

  const filename = `1099-${entitySlug ?? "all-entities"}-${year}.csv`;
  return new Response(lines.join("\n") + "\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
