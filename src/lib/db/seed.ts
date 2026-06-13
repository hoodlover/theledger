import { config } from "dotenv";
config({ path: ".env.local" });

// Idempotent seed for v0 reference data. Safe to re-run.
async function main() {
  const { db } = await import("./index");
  const { entities, bankAccounts } = await import("./schema");
  const { eq } = await import("drizzle-orm");

  const SEED_ENTITIES = [
    {
      name: "Path to Change LLC",
      slug: "path-to-change",
      kind: "s_corp",
      state: "GA",
      notes:
        "Operating company. Pays W-2 employees + 1099 contractors. Leases building from PTC Havens.",
    },
    {
      name: "PTC Havens LLC",
      slug: "ptc-havens",
      kind: "llc",
      state: "GA",
      propertyAddress: "TBD (new ~$500K building Heather buying 2026)",
      rentalClassification: "ltr",
      notes: "Holding. Building leases to Path to Change. Address pending close.",
    },
    {
      name: "H&L Place of Grace LLC",
      slug: "hl-place-of-grace",
      kind: "llc",
      state: "GA",
      propertyAddress: "3220 Continental Ave, Cumming GA 30041",
      rentalClassification: "n_a",
      notes: "Holding.",
    },
    {
      name: "H&L Havens LLC",
      slug: "hl-havens",
      kind: "llc",
      state: "GA",
      propertyAddress:
        "421 Weeks Creek Rd, Blue Ridge GA (zip TBD — verify 30513)",
      rentalClassification: "n_a",
      notes: "Holding. Cabin — possibly Airbnb in 2026 (STR vs LTR TBD).",
    },
    {
      name: "CFS LLC",
      slug: "cfs",
      kind: "sole_prop",
      state: "GA",
      notes:
        "Cobb Family Solutions. Heather's sole prop. Employs Cobb kids as cleaners. Bills Path to Change for cleaning.",
    },
    {
      name: "Personal Joint — Lance & Heather Cobb",
      slug: "personal-joint",
      kind: "individual",
      state: "GA",
      notes: "Final 1040. Receives K-1s and Schedule C flow-through.",
    },
  ];

  // From BRIEF.md §"Bank accounts, sub-accounts & cards".
  // Two Bluevine sub-accounts TBD ("Lance referenced 7 total in prior context;
  // only 5 were named"). BofA card holders TBD ("3 cards, 3 named holders").
  const SEED_ACCOUNTS: Array<{
    entitySlug: string;
    institution: string;
    last4: string;
    kind: string;
    displayName: string;
    notes?: string | null;
  }> = [
    // Bluevine sub-accounts
    { entitySlug: "hl-place-of-grace", institution: "Bluevine", last4: "9058", kind: "checking", displayName: "Bluevine • H&L Place of Grace" },
    { entitySlug: "ptc-havens",        institution: "Bluevine", last4: "6242", kind: "checking", displayName: "Bluevine • PTC Havens" },
    { entitySlug: "hl-havens",         institution: "Bluevine", last4: "6628", kind: "checking", displayName: "Bluevine • H&L Havens (6628)" },
    { entitySlug: "hl-havens",         institution: "Bluevine", last4: "8845", kind: "checking", displayName: "Bluevine • H&L Havens (8845)" },
    { entitySlug: "personal-joint",    institution: "Bluevine", last4: "6259", kind: "checking", displayName: "Bluevine • Personal Joint" },

    // BofA — Path to Change
    { entitySlug: "path-to-change", institution: "BofA", last4: "TBD", kind: "checking",    displayName: "BofA • Path to Change Checking" },
    { entitySlug: "path-to-change", institution: "BofA", last4: "TBD", kind: "savings",     displayName: "BofA • Path to Change Savings" },
    { entitySlug: "path-to-change", institution: "BofA", last4: "TBD", kind: "credit_card", displayName: "BofA Card A — Path to Change", notes: "Cardholder TBD; building expenses" },
    { entitySlug: "path-to-change", institution: "BofA", last4: "TBD", kind: "credit_card", displayName: "BofA Card B — Path to Change", notes: "Cardholder TBD; building expenses" },
    { entitySlug: "path-to-change", institution: "BofA", last4: "TBD", kind: "credit_card", displayName: "BofA Card C — Path to Change", notes: "Cardholder TBD; building expenses" },
  ];

  // ----- Entities -----
  const existingEntities = await db
    .select({ slug: entities.slug })
    .from(entities);
  const haveEntities = new Set(existingEntities.map((r) => r.slug));
  const newEntities = SEED_ENTITIES.filter((e) => !haveEntities.has(e.slug));
  if (newEntities.length) {
    await db.insert(entities).values(newEntities);
    console.log(`Inserted ${newEntities.length} entities.`);
  } else {
    console.log("Entities already seeded.");
  }

  // ----- Bank accounts -----
  const allEntities = await db.select().from(entities);
  const entityIdBySlug = new Map(allEntities.map((e) => [e.slug, e.id]));

  const existingAccounts = await db
    .select({ displayName: bankAccounts.displayName })
    .from(bankAccounts);
  const haveAccounts = new Set(existingAccounts.map((r) => r.displayName));

  const newAccounts = SEED_ACCOUNTS.filter(
    (a) => !haveAccounts.has(a.displayName)
  ).map((a) => {
    const entityId = entityIdBySlug.get(a.entitySlug);
    if (!entityId) throw new Error(`Unknown entity slug: ${a.entitySlug}`);
    return {
      entityId,
      institution: a.institution,
      last4: a.last4,
      kind: a.kind,
      displayName: a.displayName,
      routingRules: a.notes ?? null,
    };
  });

  if (newAccounts.length) {
    await db.insert(bankAccounts).values(newAccounts);
    console.log(`Inserted ${newAccounts.length} bank accounts.`);
  } else {
    console.log("Bank accounts already seeded.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
