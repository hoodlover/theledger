"use server";

import { db } from "@/lib/db";
import {
  transactions,
  interEntityTransfers,
  standingTransferRules,
} from "@/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export type TransferPurpose =
  | "rent"
  | "cleaning"
  | "loan"
  | "reimbursement"
  | "other";

export async function confirmTransfer(
  fromTxnId: string, // expense side (negative amount)
  toTxnId: string, // income side (positive amount)
  purpose: TransferPurpose,
  notes?: string
) {
  const [fromTxn] = await db
    .select()
    .from(transactions)
    .where(eq(transactions.id, fromTxnId));
  const [toTxn] = await db
    .select()
    .from(transactions)
    .where(eq(transactions.id, toTxnId));
  if (!fromTxn || !toTxn) throw new Error("Transaction not found");

  await db.insert(interEntityTransfers).values({
    occurredOn: fromTxn.postedDate,
    fromEntityId: fromTxn.entityId,
    fromTransactionId: fromTxn.id,
    toEntityId: toTxn.entityId,
    toTransactionId: toTxn.id,
    amountCents: Math.abs(fromTxn.amountCents),
    purpose,
    notes: notes?.trim() || null,
  });

  await db
    .update(transactions)
    .set({ isInterEntityTransfer: true })
    .where(inArray(transactions.id, [fromTxnId, toTxnId]));

  revalidatePath("/transfers");
  revalidatePath("/transactions");
}

export async function deleteTransfer(transferId: string) {
  const [t] = await db
    .select()
    .from(interEntityTransfers)
    .where(eq(interEntityTransfers.id, transferId));
  if (!t) return;
  await db.delete(interEntityTransfers).where(eq(interEntityTransfers.id, transferId));

  const ids = [t.fromTransactionId, t.toTransactionId].filter(
    (x): x is string => !!x
  );
  if (ids.length) {
    await db
      .update(transactions)
      .set({ isInterEntityTransfer: false })
      .where(inArray(transactions.id, ids));
  }

  revalidatePath("/transfers");
  revalidatePath("/transactions");
}

export async function createStandingRule(input: {
  fromEntityId: string;
  toEntityId: string;
  cadence: "monthly" | "semi_monthly" | "annual";
  defaultAmountCents: number | null;
  purpose: TransferPurpose;
  notes: string | null;
}) {
  await db.insert(standingTransferRules).values({
    fromEntityId: input.fromEntityId,
    toEntityId: input.toEntityId,
    cadence: input.cadence,
    defaultAmountCents: input.defaultAmountCents,
    purpose: input.purpose,
    notes: input.notes?.trim() || null,
  });
  revalidatePath("/transfers");
}

export async function toggleStandingRule(id: string, active: boolean) {
  await db
    .update(standingTransferRules)
    .set({ active })
    .where(eq(standingTransferRules.id, id));
  revalidatePath("/transfers");
}

export async function deleteStandingRule(id: string) {
  await db.delete(standingTransferRules).where(eq(standingTransferRules.id, id));
  revalidatePath("/transfers");
}
