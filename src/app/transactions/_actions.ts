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

export async function tagContractor(transactionId: string, rawName: string) {
  const name = clean(rawName);
  if (!name) return;
  const t = await loadTxn(transactionId);

  // Find existing contractor in the same entity, case-insensitive on legalName
  const existing = (
    await db
      .select()
      .from(contractors)
      .where(
        and(
          eq(contractors.entityId, t.entityId),
          sql`lower(${contractors.legalName}) = lower(${name})`
        )
      )
  )[0];

  let contractorId: string;
  if (existing) {
    contractorId = existing.id;
  } else {
    const [created] = await db
      .insert(contractors)
      .values({ entityId: t.entityId, legalName: name })
      .returning({ id: contractors.id });
    contractorId = created.id;
  }

  await db
    .update(transactions)
    .set({ contractorId })
    .where(eq(transactions.id, transactionId));
  revalidatePath("/transactions");
}

export async function untagContractor(transactionId: string) {
  await db
    .update(transactions)
    .set({ contractorId: null })
    .where(eq(transactions.id, transactionId));
  revalidatePath("/transactions");
}

// ───────── Employee (W-2 + minor child) ─────────

export async function tagEmployee(
  transactionId: string,
  rawName: string,
  kind: "standard_w2" | "minor_child"
) {
  const name = clean(rawName);
  if (!name) return;
  const t = await loadTxn(transactionId);

  const existing = (
    await db
      .select()
      .from(employees)
      .where(
        and(
          eq(employees.entityId, t.entityId),
          sql`lower(${employees.legalName}) = lower(${name})`
        )
      )
  )[0];

  let employeeId: string;
  if (existing) {
    employeeId = existing.id;
  } else {
    const [created] = await db
      .insert(employees)
      .values({ entityId: t.entityId, legalName: name, employeeKind: kind })
      .returning({ id: employees.id });
    employeeId = created.id;
  }

  await db
    .update(transactions)
    .set({ employeeId })
    .where(eq(transactions.id, transactionId));
  revalidatePath("/transactions");
}

export async function untagEmployee(transactionId: string) {
  await db
    .update(transactions)
    .set({ employeeId: null })
    .where(eq(transactions.id, transactionId));
  revalidatePath("/transactions");
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
