"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { signSessionCookie, SESSION_COOKIE } from "@/lib/auth";

export async function login(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/") || "/";

  if (!email || !password) {
    redirect("/login?error=missing");
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email));

  if (!user || !user.passwordHash) {
    redirect("/login?error=bad");
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    redirect("/login?error=bad");
  }

  const { value, expiresAt } = await signSessionCookie(user.id);
  (await cookies()).set(SESSION_COOKIE, value, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
  });

  redirect(next.startsWith("/") ? next : "/");
}
