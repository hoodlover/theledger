"use server";

import { db } from "@/lib/db";
import { llcPaperwork } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function deleteDocument(id: string) {
  await db.delete(llcPaperwork).where(eq(llcPaperwork.id, id));
  revalidatePath("/docs");
  revalidatePath("/entities", "layout");
}
