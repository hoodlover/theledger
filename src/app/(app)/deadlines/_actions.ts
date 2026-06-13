"use server";

import { db } from "@/lib/db";
import { taxDeadlines } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function markStatus(
  id: string,
  status: "open" | "scheduled" | "paid" | "overdue"
) {
  await db
    .update(taxDeadlines)
    .set({
      status,
      paidDate: status === "paid" ? new Date().toISOString().slice(0, 10) : null,
    })
    .where(eq(taxDeadlines.id, id));
  revalidatePath("/deadlines");
}

export async function deleteDeadline(id: string) {
  await db.delete(taxDeadlines).where(eq(taxDeadlines.id, id));
  revalidatePath("/deadlines");
}
