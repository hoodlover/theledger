"use server";

import { db } from "@/lib/db";
import { receipts, manualEntries, transactions } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

// ───────── Receipts ─────────

export async function linkReceiptToTxn(
  receiptId: string,
  transactionId: string
) {
  await db
    .update(receipts)
    .set({
      matchedTransactionId: transactionId,
      matchedAt: new Date(),
      matchMethod: "manual",
    })
    .where(eq(receipts.id, receiptId));
  await db
    .update(transactions)
    .set({ attachedReceiptId: receiptId })
    .where(eq(transactions.id, transactionId));
  revalidatePath("/reconcile");
  revalidatePath("/receipts");
  revalidatePath("/transactions");
}

export async function unlinkReceipt(receiptId: string) {
  const [r] = await db.select().from(receipts).where(eq(receipts.id, receiptId));
  if (r?.matchedTransactionId) {
    await db
      .update(transactions)
      .set({ attachedReceiptId: null })
      .where(eq(transactions.id, r.matchedTransactionId));
  }
  await db
    .update(receipts)
    .set({ matchedTransactionId: null, matchedAt: null, matchMethod: null })
    .where(eq(receipts.id, receiptId));
  revalidatePath("/reconcile");
  revalidatePath("/receipts");
  revalidatePath("/transactions");
}

export async function dismissReceipt(receiptId: string) {
  // Soft-dismiss: stamp the notes so it drops out of the unmatched queue
  // while staying in the receipts table for audit.
  await db
    .update(receipts)
    .set({
      matchMethod: "none",
      notes: sql`COALESCE(notes || ' · ', '') || '[reconcile-dismissed: no match]'`,
    })
    .where(eq(receipts.id, receiptId));
  revalidatePath("/reconcile");
  revalidatePath("/receipts");
}

// ───────── Manual entries ─────────

export async function linkManualToTxn(entryId: string, transactionId: string) {
  await db
    .update(manualEntries)
    .set({ matchedTransactionId: transactionId, matchedAt: new Date() })
    .where(eq(manualEntries.id, entryId));
  revalidatePath("/reconcile");
  revalidatePath("/quick-entry");
  revalidatePath("/transactions");
}

export async function dismissManualEntry(entryId: string) {
  // Wrong / duplicate manual entries get deleted outright — they were
  // never reconciled and add nothing to the ledger.
  await db.delete(manualEntries).where(eq(manualEntries.id, entryId));
  revalidatePath("/reconcile");
  revalidatePath("/quick-entry");
}
