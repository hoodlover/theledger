/**
 * Set or reset a user's password.
 *
 *   npm run set:password <email> <new-password>
 *
 * Bcrypts the password (cost 12) and writes to users.password_hash.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import bcrypt from "bcryptjs";

async function main() {
  const [email, password] = process.argv.slice(2);
  if (!email || !password) {
    console.error("Usage: npm run set:password <email> <new-password>");
    process.exit(1);
  }
  if (password.length < 8) {
    console.error("Password must be at least 8 characters.");
    process.exit(1);
  }

  const { db } = await import("../src/lib/db/index.js");
  const { users } = await import("../src/lib/db/schema.js");
  const { eq, sql } = await import("drizzle-orm");

  const [user] = await db
    .select({ id: users.id, email: users.email, name: users.name })
    .from(users)
    .where(sql`lower(${users.email}) = lower(${email})`);
  if (!user) {
    console.error(`No user with email ${email}. Seeded users:`);
    const all = await db.select({ email: users.email, name: users.name }).from(users);
    for (const u of all) console.error(`  ${u.email}  (${u.name})`);
    process.exit(1);
  }

  const hash = await bcrypt.hash(password, 12);
  await db.update(users).set({ passwordHash: hash }).where(eq(users.id, user.id));

  console.log(`Password updated for ${user.name} <${user.email}>.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
