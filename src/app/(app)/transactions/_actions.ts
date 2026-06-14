"use server";

import { db } from "@/lib/db";
import { transactions, contractors, employees } from "@/lib/db/schema";
import { eq, and, sql, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { logAudit } from "@/lib/audit";

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

  await logAudit({
    eventKind: "tag.contractor",
    summary: `Tagged "${name}" as contractor${alsoMatchMerchant ? " (bulk by merchant)" : ""}`,
    resourceKind: "transaction",
    resourceId: transactionId,
    meta: { contractorName: name, bulk: alsoMatchMerchant },
  });

  revalidatePath("/transactions");
  revalidatePath("/contractors");
}

export async function untagContractor(transactionId: string) {
  await db
    .update(transactions)
    .set({ contractorId: null })
    .where(eq(transactions.id, transactionId));
  await logAudit({
    eventKind: "untag.contractor",
    summary: "Removed contractor tag",
    resourceKind: "transaction",
    resourceId: transactionId,
  });
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

  await logAudit({
    eventKind: "tag.employee",
    summary: `Tagged "${name}" as ${kind === "minor_child" ? "minor child" : "W-2"}${alsoMatchMerchant ? " (bulk by merchant)" : ""}`,
    resourceKind: "transaction",
    resourceId: transactionId,
    meta: { employeeName: name, kind, bulk: alsoMatchMerchant },
  });
  revalidatePath("/transactions");
  revalidatePath("/employees");
}

export async function untagEmployee(transactionId: string) {
  await db
    .update(transactions)
    .set({ employeeId: null })
    .where(eq(transactions.id, transactionId));
  await logAudit({
    eventKind: "untag.employee",
    summary: "Removed employee tag",
    resourceKind: "transaction",
    resourceId: transactionId,
  });
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
  await logAudit({
    eventKind: value ? "flag.transfer.on" : "flag.transfer.off",
    summary: value
      ? "Marked as inter-entity transfer"
      : "Unmarked inter-entity transfer",
    resourceKind: "transaction",
    resourceId: transactionId,
  });
  revalidatePath("/transactions");
}

// ───────── Notes ─────────

// ───────── Bulk operations (multi-row selection) ─────────

// Group selected txn ids by entity so we can use one contractor/employee row
// per (entity, name) and not cross entity boundaries. Returns map entityId → ids[].
async function groupIdsByEntity(ids: string[]): Promise<Map<string, string[]>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({ id: transactions.id, entityId: transactions.entityId })
    .from(transactions)
    .where(inArray(transactions.id, ids));
  const map = new Map<string, string[]>();
  for (const r of rows) {
    const list = map.get(r.entityId) ?? [];
    list.push(r.id);
    map.set(r.entityId, list);
  }
  return map;
}

export async function bulkTagContractor(ids: string[], rawName: string) {
  const name = clean(rawName);
  if (!name || ids.length === 0) return { updated: 0 };
  const byEntity = await groupIdsByEntity(ids);
  let updated = 0;
  for (const [entityId, idList] of byEntity) {
    const contractorId = await findOrCreateContractor(entityId, name);
    const res = await db
      .update(transactions)
      .set({ contractorId })
      .where(inArray(transactions.id, idList));
    updated += res.rowCount ?? idList.length;
  }
  await logAudit({
    eventKind: "tag.contractor.bulk",
    summary: `Bulk-tagged ${updated} txns as contractor "${name}"`,
    resourceKind: "transaction",
    meta: { contractorName: name, count: updated },
  });
  revalidatePath("/transactions");
  revalidatePath("/contractors");
  return { updated };
}

export async function bulkTagEmployee(
  ids: string[],
  rawName: string,
  kind: "standard_w2" | "minor_child"
) {
  const name = clean(rawName);
  if (!name || ids.length === 0) return { updated: 0 };
  const byEntity = await groupIdsByEntity(ids);
  let updated = 0;
  for (const [entityId, idList] of byEntity) {
    const employeeId = await findOrCreateEmployee(entityId, name, kind);
    const res = await db
      .update(transactions)
      .set({ employeeId })
      .where(inArray(transactions.id, idList));
    updated += res.rowCount ?? idList.length;
  }
  await logAudit({
    eventKind: "tag.employee.bulk",
    summary: `Bulk-tagged ${updated} txns as ${kind === "minor_child" ? "minor child" : "W-2"} "${name}"`,
    resourceKind: "transaction",
    meta: { employeeName: name, kind, count: updated },
  });
  revalidatePath("/transactions");
  revalidatePath("/employees");
  return { updated };
}

export async function bulkMarkTransfer(ids: string[], value: boolean) {
  if (ids.length === 0) return { updated: 0 };
  const res = await db
    .update(transactions)
    .set({ isInterEntityTransfer: value })
    .where(inArray(transactions.id, ids));
  const updated = res.rowCount ?? ids.length;
  await logAudit({
    eventKind: value ? "flag.transfer.on.bulk" : "flag.transfer.off.bulk",
    summary: `${value ? "Marked" : "Unmarked"} ${updated} txns as inter-entity transfer`,
    resourceKind: "transaction",
    meta: { count: updated, value },
  });
  revalidatePath("/transactions");
  return { updated };
}

export async function bulkSetNote(ids: string[], note: string) {
  if (ids.length === 0) return { updated: 0 };
  const n = note.trim();
  const res = await db
    .update(transactions)
    .set({ notes: n || null })
    .where(inArray(transactions.id, ids));
  const updated = res.rowCount ?? ids.length;
  await logAudit({
    eventKind: "update.notes.bulk",
    summary: n
      ? `Bulk-set note on ${updated} txns (${n.slice(0, 60)})`
      : `Bulk-cleared notes on ${updated} txns`,
    resourceKind: "transaction",
    meta: { count: updated, hasNote: !!n },
  });
  revalidatePath("/transactions");
  return { updated };
}

export async function updateNotes(transactionId: string, notes: string) {
  const n = notes.trim();
  await db
    .update(transactions)
    .set({ notes: n || null })
    .where(eq(transactions.id, transactionId));
  await logAudit({
    eventKind: "update.notes",
    summary: n ? `Updated notes (${n.slice(0, 60)})` : "Cleared notes",
    resourceKind: "transaction",
    resourceId: transactionId,
  });
  revalidatePath("/transactions");
}
