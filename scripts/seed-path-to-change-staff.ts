/**
 * Seed the Path to Change LLC staff from pathtochange.net/about.
 *
 * Per Lance (2026-06-13):
 *   - Heather Cobb + Meg Smith are current W-2 employees
 *   - Every other person on the staff page is a 1099 contractor
 *
 * Idempotent: upserts on (entity_id + lower(legal_name)). Re-running
 * updates role + avatar_url but never duplicates rows.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

type StaffMember = {
  name: string;
  role: string;
  avatar: string;
};

const W2_STAFF: StaffMember[] = [
  {
    name: "Heather Cobb",
    role: "MA, LPC, CPCS · Founding Director/Owner & Clinical Director",
    avatar:
      "https://images.squarespace-cdn.com/content/v1/64753fbccc2583450825ec5d/ce7d3b4b-9a76-4413-b957-ab054693f9fe/Heather+Cobb-60.jpg",
  },
  {
    name: "Meg Smith",
    role: "Community Outreach Coordinator",
    avatar:
      "https://images.squarespace-cdn.com/content/v1/64753fbccc2583450825ec5d/a1fbc61d-5d9d-4bc2-8ab3-ab7abcd82603/Meg+Smith-9.jpg",
  },
];

const CONTRACTOR_STAFF: StaffMember[] = [
  { name: "Angie Chini",      role: "LPC",            avatar: "https://images.squarespace-cdn.com/content/v1/64753fbccc2583450825ec5d/696474f5-a17f-4a55-a576-2dd24a5ac7a4/Angie+Chini-117.jpg" },
  { name: "Emily Jones",      role: "LPC",            avatar: "https://images.squarespace-cdn.com/content/v1/64753fbccc2583450825ec5d/e101baef-b351-4bee-ac6f-29aaf98f7116/Emily+Jones-236.jpg" },
  { name: "Kayla Lin",        role: "LPC, CPCS",      avatar: "https://images.squarespace-cdn.com/content/v1/64753fbccc2583450825ec5d/23049c8f-970b-410e-a5c9-abbbf5b33cf4/Kayla+Lin-39.jpg" },
  { name: "Juan Mejia",       role: "LPC, CPCS",      avatar: "https://images.squarespace-cdn.com/content/v1/64753fbccc2583450825ec5d/81280b02-3e66-4881-b094-055c0de90909/Juan+Mejia-3.jpg" },
  { name: "Aubrey Stout",     role: "LPC, NCC",       avatar: "https://images.squarespace-cdn.com/content/v1/64753fbccc2583450825ec5d/ac70b188-4a89-4cd8-9b51-30247159fafe/Aubrey_Stout-Path+to+Change001-2.jpg" },
  { name: "Garrett Thurman",  role: "LPC, CPCS · Director, Alpharetta Location", avatar: "https://images.squarespace-cdn.com/content/v1/64753fbccc2583450825ec5d/f4d207ce-a2d3-454d-b018-fdc1fa29b142/Garrett+Thurman-3620.jpg" },
  { name: "Sanona Williams",  role: "LPC, NCC, CPCS", avatar: "https://images.squarespace-cdn.com/content/v1/64753fbccc2583450825ec5d/49ffa916-d946-4d3e-b65b-d61f750916ed/Sanona+Williams-66.jpg" },
  { name: "Kelsey Burts",     role: "APC",            avatar: "https://images.squarespace-cdn.com/content/v1/64753fbccc2583450825ec5d/1716833556414-ANLZ03FDVMYNEY207DSY/Kelsey+Burts-3.jpg" },
  // Andrea Ferenchik files her 1099 as "Andrea Linn Photography LLC" — same
  // person, different name on the IRS form. legal_name matches the 1099.
  { name: "Andrea Linn Photography LLC", role: "APC", avatar: "https://images.squarespace-cdn.com/content/v1/64753fbccc2583450825ec5d/82f02f4f-d283-4ec5-a544-83aead3f440f/Andrae_Ferenchik-Path+to+Change001.jpg" },
  { name: "Nicole Fisher",    role: "APC",            avatar: "https://images.squarespace-cdn.com/content/v1/64753fbccc2583450825ec5d/1702919552493-Q88SSN7MNUZHZZW05GKY/Nicole+Gillison-6.jpg" },
  { name: "Kendall Martin",   role: "APC",            avatar: "https://images.squarespace-cdn.com/content/v1/64753fbccc2583450825ec5d/c51d4177-3fa8-4f45-9832-9646815fd7f5/Kendall+Spangler-39.jpg" },
  { name: "Casey Shoppy",     role: "APC",            avatar: "https://images.squarespace-cdn.com/content/v1/64753fbccc2583450825ec5d/6abb479d-ee3a-4eb1-8b50-f5f2f1133c96/Casey+Shoppy-167.jpg" },
  { name: "Michelle Mejia",   role: "APC, ATR",       avatar: "https://images.squarespace-cdn.com/content/v1/64753fbccc2583450825ec5d/499ee09c-c163-4527-93fa-ded25fc19e0f/Michelle_Mejia-001.jpg" },
  { name: "Amy Van Haveren",  role: "APC",            avatar: "https://images.squarespace-cdn.com/content/v1/64753fbccc2583450825ec5d/20896ec6-3fa2-473f-99ba-7c3df25584b9/Amy+Van+Havern-0017.jpg" },
  { name: "Aisha Bobcombe",   role: "Master Level Counselor", avatar: "https://images.squarespace-cdn.com/content/v1/64753fbccc2583450825ec5d/1e20cc27-def0-4380-a90d-1d1f722068b8/Aisha+Bobcombe-246.jpg" },
  { name: "Ann-Marie Catron", role: "License Eligible", avatar: "https://images.squarespace-cdn.com/content/v1/64753fbccc2583450825ec5d/5d940b65-b282-41b9-8bed-f1c8fb3dd5e9/Ann-Marie+Catron-255+%281%29.jpg" },
  { name: "Carter Groves",    role: "Intern",         avatar: "https://images.squarespace-cdn.com/content/v1/64753fbccc2583450825ec5d/cd30144a-2553-4573-a087-4a9669e111ce/Carter+Groves.JPG" },
  { name: "Abby Peterman",    role: "Intern",         avatar: "https://images.squarespace-cdn.com/content/v1/64753fbccc2583450825ec5d/297c228f-0f53-476d-8314-eeb36983cfd8/Abigail+Peterman-0006.JPG" },
  { name: "Stephen Guynn",    role: "MA · Life Coach", avatar: "https://images.squarespace-cdn.com/content/v1/64753fbccc2583450825ec5d/d2b64e07-562b-4c52-abe7-d019cb403636/Stephen+Guynn-162.jpg" },
  { name: "Denise Thomas",    role: "MA · Life Coach", avatar: "https://images.squarespace-cdn.com/content/v1/64753fbccc2583450825ec5d/3d431c5c-2177-4199-902a-cde3bb00205b/Denise+Thomas-76.jpg" },
];

async function main() {
  const { db } = await import("../src/lib/db/index.js");
  const { entities, employees, contractors } = await import("../src/lib/db/schema.js");
  const { and, eq, sql } = await import("drizzle-orm");

  const [ptc] = await db
    .select()
    .from(entities)
    .where(eq(entities.slug, "path-to-change"));
  if (!ptc) {
    console.error("Path to Change entity not seeded — run npm run db:seed first.");
    process.exit(1);
  }

  // ───────── W-2 employees ─────────
  let empInserted = 0;
  let empUpdated = 0;
  for (const s of W2_STAFF) {
    const existing = (
      await db
        .select()
        .from(employees)
        .where(
          and(
            eq(employees.entityId, ptc.id),
            sql`lower(${employees.legalName}) = lower(${s.name})`
          )
        )
    )[0];

    if (existing) {
      await db
        .update(employees)
        .set({
          role: s.role,
          avatarUrl: s.avatar,
          employeeKind: "standard_w2",
        })
        .where(eq(employees.id, existing.id));
      empUpdated++;
      console.log(`  ~ updated W-2 employee: ${s.name}`);
    } else {
      await db.insert(employees).values({
        entityId: ptc.id,
        legalName: s.name,
        employeeKind: "standard_w2",
        role: s.role,
        avatarUrl: s.avatar,
      });
      empInserted++;
      console.log(`  + inserted W-2 employee: ${s.name}`);
    }
  }

  // ───────── 1099 contractors ─────────
  let conInserted = 0;
  let conUpdated = 0;
  for (const s of CONTRACTOR_STAFF) {
    const existing = (
      await db
        .select()
        .from(contractors)
        .where(
          and(
            eq(contractors.entityId, ptc.id),
            sql`lower(${contractors.legalName}) = lower(${s.name})`
          )
        )
    )[0];

    if (existing) {
      await db
        .update(contractors)
        .set({ role: s.role, avatarUrl: s.avatar })
        .where(eq(contractors.id, existing.id));
      conUpdated++;
      console.log(`  ~ updated contractor: ${s.name}`);
    } else {
      await db.insert(contractors).values({
        entityId: ptc.id,
        legalName: s.name,
        role: s.role,
        avatarUrl: s.avatar,
      });
      conInserted++;
      console.log(`  + inserted contractor: ${s.name}`);
    }
  }

  console.log(
    `\nW-2 employees: ${empInserted} inserted · ${empUpdated} updated`
  );
  console.log(
    `1099 contractors: ${conInserted} inserted · ${conUpdated} updated`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
