import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { employees, transactions, entities } from "@/lib/db/schema";
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

  let entityFilter;
  if (entitySlug) {
    const [e] = await db
      .select({ id: entities.id })
      .from(entities)
      .where(eq(entities.slug, entitySlug));
    if (!e) return new Response(`Unknown entity slug: ${entitySlug}`, { status: 400 });
    entityFilter = eq(employees.entityId, e.id);
  }

  const rows = await db
    .select({
      entityName: entities.name,
      legalName: employees.legalName,
      employeeKind: employees.employeeKind,
      dob: employees.dateOfBirth,
      hireDate: employees.hireDate,
      termDate: employees.termDate,
      address: employees.address,
      paidCents: sql<number>`coalesce(sum(case when ${transactions.amountCents} < 0 then -${transactions.amountCents} else 0 end), 0)::int`,
      payments: sql<number>`coalesce(count(${transactions.id}), 0)::int`,
    })
    .from(employees)
    .innerJoin(entities, eq(entities.id, employees.entityId))
    .leftJoin(
      transactions,
      and(
        eq(transactions.employeeId, employees.id),
        gte(transactions.postedDate, yearStart),
        lte(transactions.postedDate, yearEnd)
      )
    )
    .where(entityFilter!)
    .groupBy(
      employees.id,
      employees.legalName,
      employees.employeeKind,
      employees.dateOfBirth,
      employees.hireDate,
      employees.termDate,
      employees.address,
      entities.name
    )
    .orderBy(asc(entities.name), asc(employees.employeeKind), asc(employees.legalName));

  const headers = [
    "tax_year",
    "entity",
    "legal_name",
    "employee_kind",
    "date_of_birth",
    "hire_date",
    "term_date",
    "address",
    "ytd_wages",
    "payment_count",
  ];

  const lines = [row(headers)];
  for (const r of rows) {
    lines.push(
      row([
        year,
        r.entityName,
        r.legalName,
        r.employeeKind,
        r.dob ?? "",
        r.hireDate ?? "",
        r.termDate ?? "",
        r.address ?? "",
        (r.paidCents / 100).toFixed(2),
        r.payments,
      ])
    );
  }

  const slug = entitySlug ?? "all-entities";
  const filename = `employees-${slug}-${year}.csv`;
  return new Response(lines.join("\n") + "\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
