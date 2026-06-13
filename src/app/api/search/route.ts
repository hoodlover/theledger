import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import {
  entities,
  contractors,
  employees,
  bankAccounts,
  transactions,
  receipts,
  taxDeadlines,
} from "@/lib/db/schema";
import { ilike, or, sql, desc, eq, isNotNull } from "drizzle-orm";

export const dynamic = "force-dynamic";

export type SearchHit = {
  type:
    | "entity"
    | "contractor"
    | "employee"
    | "account"
    | "transaction"
    | "receipt"
    | "deadline";
  id: string;
  label: string;
  secondary?: string | null;
  amount?: number | null; // cents
  href: string;
};

const PER_BUCKET = 6;

function parseAmountCents(s: string): number | null {
  const cleaned = s.replace(/[$,\s]/g, "");
  if (!/^-?\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n === 0) return null;
  return Math.round(Math.abs(n) * 100);
}

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 2) return Response.json({ hits: [] satisfies SearchHit[] });

  const pat = `%${q}%`;
  const amountCents = parseAmountCents(q);

  const [
    entityHits,
    contractorHits,
    employeeHits,
    accountHits,
    txnHits,
    receiptHits,
    deadlineHits,
  ] = await Promise.all([
    db
      .select({
        id: entities.id,
        slug: entities.slug,
        name: entities.name,
        kind: entities.kind,
      })
      .from(entities)
      .where(
        or(
          ilike(entities.name, pat),
          ilike(entities.ein, pat),
          ilike(entities.mailingAddress, pat),
          ilike(entities.propertyAddress, pat)
        )!
      )
      .limit(PER_BUCKET),
    db
      .select({
        id: contractors.id,
        legalName: contractors.legalName,
        dba: contractors.dba,
        role: contractors.role,
      })
      .from(contractors)
      .where(
        or(
          ilike(contractors.legalName, pat),
          ilike(contractors.dba, pat),
          ilike(contractors.einOrSsnEncrypted, pat),
          ilike(contractors.role, pat)
        )!
      )
      .limit(PER_BUCKET),
    db
      .select({
        id: employees.id,
        legalName: employees.legalName,
        kind: employees.employeeKind,
        role: employees.role,
      })
      .from(employees)
      .where(
        or(
          ilike(employees.legalName, pat),
          ilike(employees.role, pat)
        )!
      )
      .limit(PER_BUCKET),
    db
      .select({
        id: bankAccounts.id,
        displayName: bankAccounts.displayName,
        institution: bankAccounts.institution,
        kind: bankAccounts.kind,
        last4: bankAccounts.last4,
      })
      .from(bankAccounts)
      .where(
        or(
          ilike(bankAccounts.displayName, pat),
          ilike(bankAccounts.institution, pat),
          ilike(bankAccounts.last4, pat)
        )!
      )
      .limit(PER_BUCKET),
    // Transactions: match merchant/desc OR exact-amount (signed match)
    db
      .select({
        id: transactions.id,
        postedDate: transactions.postedDate,
        amountCents: transactions.amountCents,
        merchant: transactions.normalizedMerchant,
        raw: transactions.rawDescription,
      })
      .from(transactions)
      .where(
        amountCents != null
          ? or(
              ilike(transactions.normalizedMerchant, pat),
              ilike(transactions.rawDescription, pat),
              eq(transactions.amountCents, amountCents),
              eq(transactions.amountCents, -amountCents)
            )!
          : or(
              ilike(transactions.normalizedMerchant, pat),
              ilike(transactions.rawDescription, pat)
            )!
      )
      .orderBy(desc(transactions.postedDate))
      .limit(PER_BUCKET),
    db
      .select({
        id: receipts.id,
        merchant: receipts.merchant,
        purchaseDate: receipts.purchaseDate,
        totalCents: receipts.totalCents,
      })
      .from(receipts)
      .where(
        or(
          ilike(receipts.merchant, pat),
          ilike(receipts.ocrRawText, pat)
        )!
      )
      .orderBy(desc(receipts.createdAt))
      .limit(PER_BUCKET),
    db
      .select({
        id: taxDeadlines.id,
        kind: taxDeadlines.kind,
        dueDate: taxDeadlines.dueDate,
        notes: taxDeadlines.notes,
        status: taxDeadlines.status,
      })
      .from(taxDeadlines)
      .where(
        or(
          ilike(taxDeadlines.kind, pat),
          ilike(taxDeadlines.notes, pat)
        )!
      )
      .orderBy(desc(taxDeadlines.dueDate))
      .limit(PER_BUCKET),
  ]);

  const KIND_LABEL: Record<string, string> = {
    s_corp: "S-Corp",
    llc: "LLC",
    sole_prop: "Sole prop",
    individual: "Personal",
  };

  const hits: SearchHit[] = [];

  for (const e of entityHits) {
    hits.push({
      type: "entity",
      id: e.id,
      label: e.name,
      secondary: KIND_LABEL[e.kind] ?? e.kind,
      href: `/entities/${e.slug}`,
    });
  }
  for (const c of contractorHits) {
    const display = c.dba ?? c.legalName;
    hits.push({
      type: "contractor",
      id: c.id,
      label: display,
      secondary: c.role ?? "1099 contractor",
      href: `/contractors/${c.id}`,
    });
  }
  for (const e of employeeHits) {
    hits.push({
      type: "employee",
      id: e.id,
      label: e.legalName,
      secondary:
        (e.kind === "minor_child" ? "Minor child" : "W-2") +
        (e.role ? ` · ${e.role}` : ""),
      href: `/employees/${e.id}`,
    });
  }
  for (const a of accountHits) {
    hits.push({
      type: "account",
      id: a.id,
      label: a.displayName,
      secondary: `${a.institution} · ${a.kind}${a.last4 !== "TBD" ? ` · ••${a.last4}` : ""}`,
      href: `/accounts/${a.id}`,
    });
  }
  for (const t of txnHits) {
    hits.push({
      type: "transaction",
      id: t.id,
      label: t.merchant ?? t.raw.slice(0, 60),
      secondary: t.postedDate,
      amount: t.amountCents,
      href: `/transactions?txn=${t.id}`,
    });
  }
  for (const r of receiptHits) {
    hits.push({
      type: "receipt",
      id: r.id,
      label: r.merchant ?? "(unknown merchant)",
      secondary: r.purchaseDate ?? "—",
      amount: r.totalCents,
      href: `/receipts`,
    });
  }
  for (const d of deadlineHits) {
    hits.push({
      type: "deadline",
      id: d.id,
      label: d.kind.replace(/_/g, " "),
      secondary: `${d.dueDate} · ${d.status}`,
      href: `/deadlines`,
    });
  }

  return Response.json({ hits });
}
