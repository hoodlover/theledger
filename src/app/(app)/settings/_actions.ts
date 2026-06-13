"use server";

import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireCurrentUser } from "@/lib/current-user";
import { signSessionCookie, SESSION_COOKIE } from "@/lib/auth";

export type ChangePasswordResult = { ok: true } | { ok: false; error: string };

export async function changePassword(
  formData: FormData
): Promise<ChangePasswordResult> {
  const me = await requireCurrentUser();
  const current = String(formData.get("currentPassword") ?? "");
  const next = String(formData.get("newPassword") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");

  if (next.length < 8) {
    return { ok: false, error: "New password must be at least 8 characters." };
  }
  if (next !== confirm) {
    return { ok: false, error: "New password and confirmation don't match." };
  }

  const [row] = await db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, me.id));
  if (!row?.passwordHash) {
    return { ok: false, error: "Account has no current password — use the CLI." };
  }
  const okOld = await bcrypt.compare(current, row.passwordHash);
  if (!okOld) {
    return { ok: false, error: "Current password is incorrect." };
  }

  const hash = await bcrypt.hash(next, 12);
  await db.update(users).set({ passwordHash: hash }).where(eq(users.id, me.id));

  // Re-issue session so the cookie keeps a fresh 1y expiry post-change
  const { value, expiresAt } = await signSessionCookie(me.id);
  (await cookies()).set(SESSION_COOKIE, value, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
  });

  return { ok: true };
}

export async function signOutEverywhere() {
  // Sessions are stateless HMAC cookies; the only way to invalidate ALL
  // outstanding sessions is to rotate SESSION_SECRET on the server.
  // This action clears THIS session and tells the operator what to do.
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login?signedOut=1");
}
