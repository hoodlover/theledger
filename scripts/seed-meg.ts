/**
 * One-shot: ensure meg@pathtochange.net exists in users with the
 * provided password set. Idempotent — re-runs just rotate the password.
 *
 *   MEG_PW=<password> npx tsx scripts/seed-meg.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import bcrypt from "bcryptjs";

async function main() {
  const pw = process.env.MEG_PW;
  if (!pw || pw.length < 6) {
    console.error("MEG_PW env var required (>=6 chars)");
    process.exit(1);
  }

  const { db } = await import("../src/lib/db/index");
  const { users } = await import("../src/lib/db/schema");
  const { eq, sql } = await import("drizzle-orm");

  const email = "meg@pathtochange.net";
  const name = "Meg";
  const hash = await bcrypt.hash(pw, 12);

  const existing = (
    await db
      .select({ id: users.id })
      .from(users)
      .where(sql`lower(${users.email}) = lower(${email})`)
  )[0];

  if (existing) {
    await db
      .update(users)
      .set({ name, passwordHash: hash })
      .where(eq(users.id, existing.id));
    console.log(`Updated existing user ${existing.id} (${email})`);
  } else {
    const [created] = await db
      .insert(users)
      .values({ name, email, passwordHash: hash })
      .returning({ id: users.id });
    console.log(`Created user ${created.id} (${email})`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
