"use server";

import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";
import { revalidatePath } from "next/cache";

const COOKIE = "tl_user";

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
};

// Pre-auth current-user shim. Persists a chosen user ID in a cookie so
// Lance and Heather can share a device or swap personas without auth.
// Replace with real session lookup once auth is wired.
export async function getCurrentUser(): Promise<CurrentUser> {
  const cookieStore = await cookies();
  const cookieId = cookieStore.get(COOKIE)?.value;

  if (cookieId) {
    const [u] = await db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .where(eq(users.id, cookieId));
    if (u) return u;
  }

  // Default to the first seeded user (Lance, sorted by created_at asc via
  // email fallback). Set the cookie so we stop hitting this path.
  const [first] = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .orderBy(asc(users.email))
    .limit(1);

  if (!first) {
    throw new Error("No users seeded yet — run npm run db:seed.");
  }
  return first;
}

export async function setCurrentUser(formData: FormData) {
  const id = String(formData.get("userId") ?? "");
  if (!id) return;
  (await cookies()).set(COOKIE, id, {
    path: "/",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath("/", "layout");
}
