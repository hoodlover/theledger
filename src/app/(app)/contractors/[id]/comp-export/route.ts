import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { contractors, transactions, bankAccounts } from "@/lib/db/schema";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { logAudit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/current-user";

export const dynamic = "force-dynamic";

// CSV per counselor of every YTD payment from the bank ledger, with
// gross-up math when a fee_keep_percent is set:
//   counselor_take = payment (what we paid them)
//   gross = take / (keepPct / 100)
//   ptc_share = gross - take
//
// Useful for tax-season prep + the counselor's own bookkeeping.
//
//   GET /contractors/{id}/comp-export?year=2026

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const me = await getCurrentUser();
  if (!me) return new Response("unauthorized", { status: 401 });

  const { id } = await params;
  const yearRaw = req.nextUrl.searchParams.get("year");
  const year = yearRaw && /^\d{4}$/.test(yearRaw) ? Number(yearRaw) : new Date().getFullYear();
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;

  const [c] = await db.select().from(contractors).where(eq(contractors.id, id));
  if (!c) return new Response("not found", { status: 404 });

  const rows = await db
    .select({
      postedDate: transactions.postedDate,
      amountCents: transactions.amountCents,
      merchant: transactions.normalizedMerchant,
      raw: transactions.rawDescription,
      accountName: bankAccounts.displayName,
    })
    .from(transactions)
    .innerJoin(bankAccounts, eq(bankAccounts.id, transactions.bankAccountId))
    .where(
      and(
        eq(transactions.contractorId, id),
        gte(transactions.postedDate, yearStart),
        lte(transactions.postedDate, yearEnd)
      )
    )
    .orderBy(asc(transactions.postedDate));

  const keep = c.feeKeepPercent ?? null;
  const keepFrac = keep && keep > 0 && keep <= 100 ? keep / 100 : null;

  function esc(s: string | null | undefined): string {
    if (s == null) return "";
    const str = String(s);
    if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
    return str;
  }
  function dollars(cents: number): string {
    return (cents / 100).toFixed(2);
  }

  let totalTake = 0;
  let totalGross = 0;
  let totalPtc = 0;

  const header = keepFrac
    ? "date,description,account,take_usd,gross_usd,ptc_share_usd\n"
    : "date,description,account,take_usd\n";
  const body = rows
    .filter((r) => r.amountCents < 0) // debits only — what we paid them
    .map((r) => {
      const takeCents = Math.abs(r.amountCents);
      const grossCents = keepFrac ? Math.round(takeCents / keepFrac) : takeCents;
      const ptcCents = grossCents - takeCents;
      totalTake += takeCents;
      totalGross += grossCents;
      totalPtc += ptcCents;
      const descr = r.merchant ?? r.raw.slice(0, 80);
      return keepFrac
        ? [
            r.postedDate,
            esc(descr),
            esc(r.accountName),
            dollars(takeCents),
            dollars(grossCents),
            dollars(ptcCents),
          ].join(",")
        : [r.postedDate, esc(descr), esc(r.accountName), dollars(takeCents)].join(",");
    })
    .join("\n");

  const totals = keepFrac
    ? `\n,,TOTAL,${dollars(totalTake)},${dollars(totalGross)},${dollars(totalPtc)}\n`
    : `\n,,TOTAL,${dollars(totalTake)}\n`;

  const csv = header + body + totals;

  const slug = (c.dba ?? c.legalName).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const filename = `${slug}-comp-${year}.csv`;

  await logAudit({
    eventKind: "comp_export.download",
    summary: `Comp export ${c.dba ?? c.legalName} for ${year}`,
    resourceKind: "contractor",
    resourceId: id,
    meta: { year, rowCount: rows.length, totalTakeCents: totalTake },
  });

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
