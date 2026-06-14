"use server";

import { db } from "@/lib/db";
import { savedFilters } from "@/lib/db/schema";
import { and, eq, asc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireCurrentUser } from "@/lib/current-user";
import { logAudit } from "@/lib/audit";

export type SavedFilter = {
  id: string;
  name: string;
  queryString: string;
};

export async function listSavedFilters(): Promise<SavedFilter[]> {
  const user = await requireCurrentUser();
  const rows = await db
    .select({
      id: savedFilters.id,
      name: savedFilters.name,
      queryString: savedFilters.queryString,
    })
    .from(savedFilters)
    .where(eq(savedFilters.userId, user.id))
    .orderBy(asc(savedFilters.createdAt));
  return rows;
}

export async function saveFilter(name: string, queryString: string): Promise<void> {
  const user = await requireCurrentUser();
  const trimmed = name.trim().slice(0, 60);
  if (!trimmed) return;

  const [row] = await db
    .insert(savedFilters)
    .values({
      userId: user.id,
      name: trimmed,
      queryString,
    })
    .returning({ id: savedFilters.id });

  await logAudit({
    eventKind: "filter.save",
    summary: `Saved filter "${trimmed}"`,
    resourceKind: "saved_filter",
    resourceId: row.id,
    meta: { queryString },
  });
  revalidatePath("/transactions");
}

export async function deleteFilter(id: string): Promise<void> {
  const user = await requireCurrentUser();
  const [row] = await db
    .select({ name: savedFilters.name })
    .from(savedFilters)
    .where(and(eq(savedFilters.id, id), eq(savedFilters.userId, user.id)));
  if (!row) return;

  await db
    .delete(savedFilters)
    .where(and(eq(savedFilters.id, id), eq(savedFilters.userId, user.id)));

  await logAudit({
    eventKind: "filter.delete",
    summary: `Deleted saved filter "${row.name}"`,
    resourceKind: "saved_filter",
    resourceId: id,
  });
  revalidatePath("/transactions");
}
