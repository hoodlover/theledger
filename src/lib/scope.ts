"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { entities } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const COOKIE = "tl_entity";

export type EntityScope = {
  slug: string;
  entity: typeof entities.$inferSelect | null;
};

export async function getActiveScope(): Promise<EntityScope> {
  const slug = (await cookies()).get(COOKIE)?.value ?? "all";
  if (slug === "all") return { slug: "all", entity: null };
  const entity = (
    await db.select().from(entities).where(eq(entities.slug, slug))
  )[0];
  return entity ? { slug, entity } : { slug: "all", entity: null };
}

export async function setEntityScope(formData: FormData) {
  const slug = String(formData.get("slug") ?? "all");
  (await cookies()).set(COOKIE, slug, {
    path: "/",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath("/", "layout");
}
