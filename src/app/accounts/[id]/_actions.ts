"use server";

import { db } from "@/lib/db";
import { bankAccounts, creditCardHolders } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

function nullable(s: string | null | undefined): string | null {
  const t = (s ?? "").trim();
  return t.length ? t : null;
}

export async function updateAccount(
  id: string,
  patch: {
    displayName?: string;
    institution?: string;
    kind?: string;
    last4?: string;
    routingRules?: string | null;
  }
) {
  const set: Record<string, unknown> = {};
  if (patch.displayName !== undefined) set.displayName = patch.displayName.trim();
  if (patch.institution !== undefined) set.institution = patch.institution.trim();
  if (patch.kind !== undefined) set.kind = patch.kind;
  if (patch.last4 !== undefined) set.last4 = patch.last4.trim() || "TBD";
  if (patch.routingRules !== undefined) set.routingRules = nullable(patch.routingRules);

  if (Object.keys(set).length === 0) return;
  await db.update(bankAccounts).set(set).where(eq(bankAccounts.id, id));
  revalidatePath("/accounts");
  revalidatePath(`/accounts/${id}`);
}

export async function deleteAccount(id: string) {
  await db.delete(bankAccounts).where(eq(bankAccounts.id, id));
  revalidatePath("/accounts");
  revalidatePath("/transactions");
  revalidatePath("/");
}

export async function addCardHolder(
  bankAccountId: string,
  personName: string,
  personRole: string,
  started: string
) {
  if (!personName.trim()) return;
  await db.insert(creditCardHolders).values({
    bankAccountId,
    personName: personName.trim(),
    personRole: personRole.trim() || null,
    started: started || null,
  });
  revalidatePath(`/accounts/${bankAccountId}`);
  revalidatePath("/accounts");
}

export async function removeCardHolder(holderId: string, bankAccountId: string) {
  await db.delete(creditCardHolders).where(eq(creditCardHolders.id, holderId));
  revalidatePath(`/accounts/${bankAccountId}`);
  revalidatePath("/accounts");
}

export async function endCardHolder(
  holderId: string,
  bankAccountId: string,
  endDate: string
) {
  await db
    .update(creditCardHolders)
    .set({ ended: endDate || null })
    .where(eq(creditCardHolders.id, holderId));
  revalidatePath(`/accounts/${bankAccountId}`);
}
