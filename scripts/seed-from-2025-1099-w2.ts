/**
 * Backfill Path to Change LLC + CFS + every contractor and W-2 employee
 * from the 2025 filed 1099-NEC and W-2 forms Lance provided.
 *
 * Idempotent: existing rows get updated in place, new ones inserted.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

const PTC = {
  ein: "82-1116780",
  mailingAddress: "314 Tribble Gap Road, Suite B, Cumming GA 30040",
  phone: "(770) 615-6115",
  stateEmployerId: "3255358-RU", // GA employer ID from W-2 box 15
};

const CFS = {
  // Real legal name. The 2025 1099-NEC from Path to Change was filed
  // with the WRONG name ("Cobb Family Services, LLC") — Lance to decide
  // whether to issue a 1099 correction.
  newName: "Cobb Family Solutions, LLC",
  ein: "82-1521469",
  mailingAddress: "4625 Forest Place, Cumming GA 30041",
  notes:
    "Cobb Family Solutions, LLC. Heather's sole prop. Employs Cobb kids as cleaners. Bills Path to Change for cleaning services. NOTE: 2025 1099-NEC from Path to Change was filed with the wrong name ('Cobb Family Services, LLC') — confirm whether a 1099-NEC correction is needed.",
};

// EMPLOYEES (W-2 filed 2025)
const EMPLOYEES = [
  {
    matchName: "Heather Cobb",
    legalName: "Heather B. Cobb",
    ssn: "181-52-4539",
    address: "4625 Forest Place, Cumming GA 30041",
  },
  {
    // Staff page lists her as Meg Smith; W-2 filed as Maureen E. Smith.
    matchName: "Meg Smith",
    legalName: "Maureen E. Smith",
    ssn: "392-70-3018",
    address: "2590 Hopewell Plantation Dr, Alpharetta GA 30004",
  },
];

// 1099-NEC contractors (2025 filed forms). matchName picks the existing
// staff-page row by lower(legal_name); when matchName is null this row is
// inserted fresh (people not on the public staff page).
type ContractorSpec = {
  matchName: string | null; // staff-page legal name to match on, or null
  legalName: string; // IRS-registered recipient name → recipient_name on 1099
  dba: string | null; // "displayed as" / friendly name if different
  einOrSsn: string;
  address: string;
  role: string | null; // override / set role
  notes: string | null;
};

const CONTRACTORS: ContractorSpec[] = [
  // ── Existing staff-page contractors with 1099 data ──
  { matchName: "Angie Chini",      legalName: "Angie Chini, LLC",        dba: "Angie Chini",     einOrSsn: "45-5107476", address: "2502 Venture Dr, Gainesville GA 30506", role: null, notes: null },
  { matchName: "Aubrey Stout",     legalName: "The Spilling Cup LLC",    dba: "Aubrey Stout",    einOrSsn: "33-3059624", address: "4689 Gold Dust Trail, Sugar Hill GA 30518", role: null, notes: null },
  { matchName: "Casey Shoppy",     legalName: "Casey Shoppy",            dba: null,              einOrSsn: "667-03-7365", address: "11046 Alpharetta Highway, Apt. 3128, Roswell GA 30076", role: null, notes: null },
  { matchName: "Denise Thomas",    legalName: "Denise Thomas",           dba: null,              einOrSsn: "260-27-6499", address: "6495 Calamar Drive, Cumming GA 30040", role: null, notes: null },
  // Filed as Emily Knight on the 1099; staff page lists her as Emily Jones — same person, likely married/maiden name divergence.
  { matchName: "Emily Jones",      legalName: "Emily Knight",            dba: "Emily Jones",     einOrSsn: "87-4246010", address: "11181 Calypso Drive, Alpharetta GA 30009", role: null, notes: "1099 filed as Emily Knight; staff page shows Emily Jones. Verify which is current legal name." },
  { matchName: "Garrett Thurman",  legalName: "GTT Counseling, LLC",     dba: "Garrett Thurman", einOrSsn: "83-4282853", address: "3082 Kentmere Drive, Cumming GA 30040", role: null, notes: null },
  { matchName: "Juan Mejia",       legalName: "Juan Mejia",              dba: null,              einOrSsn: "99-0823237", address: "2415 Flower Mill Pl, Buford GA 30519-4803", role: null, notes: null },
  { matchName: "Kayla Lin",        legalName: "Kayla Lin",               dba: null,              einOrSsn: "87-4211243", address: "2155 Thomas Road, Cleveland GA 30528", role: null, notes: null },
  { matchName: "Kelsey Burts",     legalName: "Kelsey Burts",            dba: null,              einOrSsn: "252-99-5061", address: "5345 Memento Trce, Cumming GA 30040-9805", role: null, notes: null },
  { matchName: "Kendall Martin",   legalName: "Kendall Martin",          dba: null,              einOrSsn: "279-04-5721", address: "1020 Fairchild Ct, Marietta GA 30068", role: null, notes: null },
  { matchName: "Sanona Williams",  legalName: "SW Behavioral Services",  dba: "Sanona Williams", einOrSsn: "45-5363753", address: "3072 Sweetbriar Walk, Snellville GA 30039", role: null, notes: null },
  { matchName: "Nicole Fisher",    legalName: "Nicole Fisher",           dba: null,              einOrSsn: "99-1846438", address: "7325 Heathfield Ct., Cumming GA 30028", role: null, notes: null },
  { matchName: "Michelle Mejia",   legalName: "Michelle Mejia",          dba: null,              einOrSsn: "622-44-9101", address: "2415 Flower Mill Pl, Buford GA 30519-4803", role: null, notes: "Same household as Juan Mejia." },

  // Andrea Ferenchik (APC on staff page) files her 1099 as "Andrea Linn
  // Photography LLC". Merge into the existing staff record by matching on
  // her staff-page name (seed:staff renames legal_name to the LLC form).
  { matchName: "Andrea Linn Photography LLC", legalName: "Andrea Linn Photography LLC", dba: "Andrea Ferenchik", einOrSsn: "82-1976937", address: "4115 Hedgemoore Court, Cumming GA 30041", role: "APC", notes: null },

  // ── New contractors from the 1099s, not on the staff page ──
  { matchName: null, legalName: "Robert & Penelope McGuinn Partnership LPII", dba: null,        einOrSsn: "58-2503913", address: "190 W. Clovehurst Ave, Athens GA 30605",  role: "Cumming office landlord",       notes: "PAYS RENT — recipient of office rent for Cumming location." },
  { matchName: null, legalName: "Chakrika Investments LLC",          dba: "Amaranatha Kotrakona", einOrSsn: "88-1156826", address: "610 Marylebone Dr, Suwanee GA 30024",     role: "Alpharetta office landlord",    notes: "PAYS RENT — Alpharetta office. Paid via Zelle Recurring to Amaranatha Kotrakona (the LLC's owner)." },
  { matchName: "Cobb Family Services, LLC", legalName: "Cobb Family Solutions, LLC", dba: "CFS — cleaning",     einOrSsn: "82-1521469", address: "4625 Forest Place, Cumming GA 30041",     role: "Cleaning services",             notes: "INTER-ENTITY — CFS bills Path to Change for cleaning. Mirror of the CFS entity; track 1099 issuance here while the actual money flow stays on /transfers. 2025 1099 was filed with WRONG name 'Cobb Family Services' instead of 'Solutions' — possible correction needed." },
];

async function main() {
  const { db } = await import("../src/lib/db/index.js");
  const { entities, contractors, employees } = await import("../src/lib/db/schema.js");
  const { and, eq, sql } = await import("drizzle-orm");

  // ───────── Path to Change entity ─────────
  await db
    .update(entities)
    .set({
      ein: PTC.ein,
      mailingAddress: PTC.mailingAddress,
      phone: PTC.phone,
      stateEmployerId: PTC.stateEmployerId,
    })
    .where(eq(entities.slug, "path-to-change"));
  console.log(`Updated Path to Change with EIN ${PTC.ein} + address + GA employer ID`);

  // ───────── CFS entity ─────────
  await db
    .update(entities)
    .set({
      name: CFS.newName,
      ein: CFS.ein,
      mailingAddress: CFS.mailingAddress,
      notes: CFS.notes,
    })
    .where(eq(entities.slug, "cfs"));
  console.log(`Updated CFS → "${CFS.newName}" with EIN ${CFS.ein}`);

  // ───────── Path to Change → contractors ─────────
  const [ptcRow] = await db
    .select()
    .from(entities)
    .where(eq(entities.slug, "path-to-change"));
  if (!ptcRow) throw new Error("Path to Change entity missing");

  let conInserted = 0;
  let conUpdated = 0;
  for (const c of CONTRACTORS) {
    const matchKey = c.matchName ?? c.legalName;
    const existing = (
      await db
        .select()
        .from(contractors)
        .where(
          and(
            eq(contractors.entityId, ptcRow.id),
            sql`lower(${contractors.legalName}) = lower(${matchKey})`
          )
        )
    )[0];

    if (existing) {
      await db
        .update(contractors)
        .set({
          legalName: c.legalName,
          dba: c.dba,
          einOrSsnEncrypted: c.einOrSsn,
          address: c.address,
          ...(c.role ? { role: c.role } : {}),
          ...(c.notes
            ? {
                // No notes column on contractors — fold into dba's secondary line via role for now.
                // Schema has only `role` for prose; leave the note for the followup.
              }
            : {}),
        })
        .where(eq(contractors.id, existing.id));
      conUpdated++;
      console.log(`  ~ updated contractor: ${c.legalName}`);
    } else {
      await db.insert(contractors).values({
        entityId: ptcRow.id,
        legalName: c.legalName,
        dba: c.dba,
        einOrSsnEncrypted: c.einOrSsn,
        address: c.address,
        role: c.role,
      });
      conInserted++;
      console.log(`  + inserted contractor: ${c.legalName}`);
    }
  }

  // ───────── Path to Change → employees ─────────
  let empUpdated = 0;
  for (const e of EMPLOYEES) {
    const existing = (
      await db
        .select()
        .from(employees)
        .where(
          and(
            eq(employees.entityId, ptcRow.id),
            sql`lower(${employees.legalName}) = lower(${e.matchName})`
          )
        )
    )[0];
    if (!existing) {
      console.warn(`  ! employee ${e.matchName} not seeded — skipping`);
      continue;
    }
    await db
      .update(employees)
      .set({
        legalName: e.legalName,
        ssnEncrypted: e.ssn,
        address: e.address,
      })
      .where(eq(employees.id, existing.id));
    empUpdated++;
    console.log(`  ~ updated employee: ${e.legalName}`);
  }

  console.log(
    `\nContractors: ${conInserted} inserted · ${conUpdated} updated`
  );
  console.log(`Employees: ${empUpdated} updated`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
