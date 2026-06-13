import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import {
  transactions,
  bankAccounts,
  entities,
  contractors,
  employees,
} from "@/lib/db/schema";
import { and, eq, gte, lte, asc } from "drizzle-orm";

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

  let entityId: string | null = null;
  let entityName = "all-entities";
  if (entitySlug) {
    const [e] = await db
      .select({ id: entities.id, name: entities.name })
      .from(entities)
      .where(eq(entities.slug, entitySlug));
    if (!e) return new Response(`Unknown entity slug: ${entitySlug}`, { status: 400 });
    entityId = e.id;
    entityName = e.name;
  }

  const conditions = [
    gte(transactions.postedDate, yearStart),
    lte(transactions.postedDate, yearEnd),
  ];
  if (entityId) conditions.push(eq(transactions.entityId, entityId));

  const rows = await db
    .select({
      postedDate: transactions.postedDate,
      entityName: entities.name,
      accountName: bankAccounts.displayName,
      institution: bankAccounts.institution,
      kind: bankAccounts.kind,
      last4: bankAccounts.last4,
      normalizedMerchant: transactions.normalizedMerchant,
      rawDescription: transactions.rawDescription,
      amountCents: transactions.amountCents,
      contractorName: contractors.legalName,
      employeeName: employees.legalName,
      employeeKind: employees.employeeKind,
      isInterEntityTransfer: transactions.isInterEntityTransfer,
      propertyTag: transactions.propertyTag,
      notes: transactions.notes,
    })
    .from(transactions)
    .innerJoin(entities, eq(entities.id, transactions.entityId))
    .innerJoin(bankAccounts, eq(bankAccounts.id, transactions.bankAccountId))
    .leftJoin(contractors, eq(contractors.id, transactions.contractorId))
    .leftJoin(employees, eq(employees.id, transactions.employeeId))
    .where(and(...conditions))
    .orderBy(asc(transactions.postedDate));

  const headers = [
    "date",
    "entity",
    "account",
    "institution",
    "account_kind",
    "last4",
    "merchant",
    "raw_description",
    "amount",
    "contractor",
    "employee",
    "employee_kind",
    "is_inter_entity_transfer",
    "property_tag",
    "notes",
  ];

  const lines = [row(headers)];
  for (const r of rows) {
    lines.push(
      row([
        r.postedDate,
        r.entityName,
        r.accountName,
        r.institution,
        r.kind,
        r.last4 === "TBD" ? "" : r.last4,
        r.normalizedMerchant ?? "",
        r.rawDescription,
        (r.amountCents / 100).toFixed(2),
        r.contractorName ?? "",
        r.employeeName ?? "",
        r.employeeKind ?? "",
        r.isInterEntityTransfer ? "true" : "false",
        r.propertyTag ?? "",
        r.notes ?? "",
      ])
    );
  }

  const slug = entitySlug ?? "all-entities";
  const filename = `transactions-${slug}-${year}.csv`;
  return new Response(lines.join("\n") + "\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
