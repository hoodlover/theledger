import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { db } = await import("../src/lib/db/index");
  const { contractors, entities } = await import("../src/lib/db/schema");
  const { eq, sql } = await import("drizzle-orm");

  const [ptc] = await db
    .select()
    .from(entities)
    .where(eq(entities.slug, "path-to-change"));
  if (!ptc) {
    console.error("Path to Change entity not found");
    process.exit(1);
  }

  const rows = await db
    .select()
    .from(contractors)
    .where(sql`entity_id = ${ptc.id}`)
    .orderBy(contractors.legalName);

  console.log(`All Path to Change contractors (${rows.length}):`);
  for (const r of rows) {
    console.log(`  ${r.id}  ${r.legalName}  | dba: ${r.dba ?? "-"}  | role: ${r.role ?? "-"}`);
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
