"use server";

import { db } from "@/lib/db";
import { transactions, contractors, employees } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

// All actions revalidate the /transactions tree so the row's status pills,
// stats strip, and the drawer (open via ?txn) all reflect the change.

async function loadTxn(id: string) {
  const [t] = await db.select().from(transactions).where(eq(transactions.id, id));
  if (!t) throw new Error(`Transaction not found: ${id}`);
  return t;
}

function clean(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

// ───────── Contractor (1099) ─────────

async function findOrCreateContractor(
  entityId: string,
  name: string
): Promise<string> {
  const existing = (
    await db
      .select()
      .from(contractors)
      .where(
        and(
          eq(contractors.entityId, entityId),
          sql`lower(${contractors.legalName}) = lower(${name})`
        )
      )
  )[0];
  if (existing) return existing.id;
  const [created] = await db
    .insert(contractors)
    .values({ entityId, legalName: name })
    .returning({ id: contractors.id });
  return created.id;
}

export async function tagContractor(
  transactionId: string,
  rawName: string,
  alsoMatchMerchant = false
) {
  const name = clean(rawName);
  if (!name) return;
  const t = await loadTxn(transactionId);
  const contractorId = await findOrCreateContractor(t.entityId, name);

  await db
    .update(transactions)
    .set({ contractorId })
    .where(eq(transactions.id, transactionId));

  if (alsoMatchMerchant && t.normalizedMerchant) {
    // Tag all other txns in the same entity with the same normalized merchant
    // that are NOT already tagged to a contractor. Existing tags are preserved
    // so a careful manual tag wins over the bulk pass.
    await db
      .update(transactions)
      .set({ contractorId })
      .where(
        and(
          eq(transactions.entityId, t.entityId),
          eq(transactions.normalizedMerchant, t.normalizedMerchant),
          sql`${transactions.contractorId} is null`
        )
      );
  }

  revalidatePath("/transactions");
  revalidatePath("/contractors");
}

export async function untagContractor(transactionId: string) {
  await db
    .update(transactions)
    .set({ contractorId: null })
    .where(eq(transactions.id, transactionId));
  revalidatePath("/transactions");
  revalidatePath("/contractors");
}

// ───────── Employee (W-2 + minor child) ─────────

async function findOrCreateEmployee(
  entityId: string,
  name: string,
  kind: "standard_w2" | "minor_child"
): Promise<string> {
  const existing = (
    await db
      .select()
      .from(employees)
      .where(
        and(
          eq(employees.entityId, entityId),
          sql`lower(${employees.legalName}) = lower(${name})`
        )
      )
  )[0];
  if (existing) return existing.id;
  const [created] = await db
    .insert(employees)
    .values({ entityId, legalName: name, employeeKind: kind })
    .returning({ id: employees.id });
  return created.id;
}

export async function tagEmployee(
  transactionId: string,
  rawName: string,
  kind: "standard_w2" | "minor_child",
  alsoMatchMerchant = false
) {
  const name = clean(rawName);
  if (!name) return;
  const t = await loadTxn(transactionId);
  const employeeId = await findOrCreateEmployee(t.entityId, name, kind);

  await db
    .update(transactions)
    .set({ employeeId })
    .where(eq(transactions.id, transactionId));

  if (alsoMatchMerchant && t.normalizedMerchant) {
    await db
      .update(transactions)
      .set({ employeeId })
      .where(
        and(
          eq(transactions.entityId, t.entityId),
          eq(transactions.normalizedMerchant, t.normalizedMerchant),
          sql`${transactions.employeeId} is null`
        )
      );
  }

  revalidatePath("/transactions");
  revalidatePath("/employees");
}

export async function untagEmployee(transactionId: string) {
  await db
    .update(transactions)
    .set({ employeeId: null })
    .where(eq(transactions.id, transactionId));
  revalidatePath("/transactions");
  revalidatePath("/employees");
}

// ───────── Inter-entity transfer flag ─────────

export async function toggleTransferFlag(
  transactionId: string,
  value: boolean
) {
  await db
    .update(transactions)
    .set({ isInterEntityTransfer: value })
    .where(eq(transactions.id, transactionId));
  revalidatePath("/transactions");
}

// ───────── Notes ─────────

export async function updateNotes(transactionId: string, notes: string) {
  const n = notes.trim();
  await db
    .update(transactions)
    .set({ notes: n || null })
    .where(eq(transactions.id, transactionId));
  revalidatePath("/transactions");
}
