"use server";

import { db } from "@/lib/db";
import { manualEntries, transactions } from "@/lib/db/schema";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireCurrentUser } from "@/lib/current-user";

const MATCH_DATE_WINDOW_DAYS = 5;

function shiftDate(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export type SubmitInput = {
  entityId: string;
  amountCents: number; // ALREADY signed: negative=paid out, positive=received
  date: string; // YYYY-MM-DD
  payeeText: string;
  notes: string;
};

export type SubmitResult = {
  manualEntryId: string;
  matchedTransactionId: string | null;
  candidateCount: number;
};

export async function submitManualEntry(
  input: SubmitInput
): Promise<SubmitResult> {
  if (!input.entityId) throw new Error("entityId required");
  if (!input.date) throw new Error("date required");
  if (input.amountCents === 0) throw new Error("amount must be non-zero");

  const user = await requireCurrentUser();

  const [created] = await db
    .insert(manualEntries)
    .values({
      enteredByUserId: user.id,
      entityId: input.entityId,
      amountCents: input.amountCents,
      date: input.date,
      payeeText: input.payeeText.trim() || null,
      notes: input.notes.trim() || null,
    })
    .returning({ id: manualEntries.id });

  // Auto-match: find transactions on the same entity with the EXACT signed
  // amount within ±N days. Exact amount match avoids cross-tagging $50.00
  // expenses to $50.00 refunds in the same window.
  const lo = shiftDate(input.date, -MATCH_DATE_WINDOW_DAYS);
  const hi = shiftDate(input.date, +MATCH_DATE_WINDOW_DAYS);

  const matches = await db
    .select({ id: transactions.id })
    .from(transactions)
    .where(
      and(
        eq(transactions.entityId, input.entityId),
        eq(transactions.amountCents, input.amountCents),
        gte(transactions.postedDate, lo),
        lte(transactions.postedDate, hi),
        sql`NOT EXISTS (
          SELECT 1 FROM manual_entries me
          WHERE me.matched_transaction_id = transactions.id
        )`
      )
    )
    .limit(2);

  let matchedId: string | null = null;
  if (matches.length === 1) {
    matchedId = matches[0].id;
    await db
      .update(manualEntries)
      .set({ matchedTransactionId: matchedId, matchedAt: new Date() })
      .where(eq(manualEntries.id, created.id));
  }

  revalidatePath("/quick-entry");
  revalidatePath("/transactions");
  return {
    manualEntryId: created.id,
    matchedTransactionId: matchedId,
    candidateCount: matches.length,
  };
}

export async function manuallyMatchEntry(
  entryId: string,
  transactionId: string
) {
  await db
    .update(manualEntries)
    .set({ matchedTransactionId: transactionId, matchedAt: new Date() })
    .where(eq(manualEntries.id, entryId));
  revalidatePath("/quick-entry");
  revalidatePath("/transactions");
}

export async function dismissEntry(entryId: string) {
  await db.delete(manualEntries).where(eq(manualEntries.id, entryId));
  revalidatePath("/quick-entry");
}
