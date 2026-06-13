"use server";

import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { verifySessionCookie, SESSION_COOKIE } from "@/lib/auth";

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
};

/**
 * Resolve the current user from the auth session cookie.
 * Returns null when there's no valid session (middleware should keep
 * unauthenticated requests off authenticated pages, but server actions
 * should still defend.)
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const cookieStore = await cookies();
  const session = await verifySessionCookie(cookieStore.get(SESSION_COOKIE)?.value);
  if (!session) return null;
  const [u] = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(eq(users.id, session.userId));
  return u ?? null;
}

/**
 * Same as getCurrentUser but throws when missing — for use inside server
 * actions that should never run unauthenticated.
 */
export async function requireCurrentUser(): Promise<CurrentUser> {
  const u = await getCurrentUser();
  if (!u) throw new Error("Unauthenticated");
  return u;
}
