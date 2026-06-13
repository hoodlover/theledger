/**
 * Auto-seed tax deadlines per entity for a given year.
 *
 *   npm run seed:deadlines           # current year + next year
 *   npm run seed:deadlines -- 2026   # just 2026
 *
 * Idempotent on (entity_id, kind, due_date). Re-running adds anything
 * missing, never duplicates.
 *
 * Skips dates that vary per property / per filing (registered-agent
 * renewals, property tax, insurance, mortgage) — those are added by hand
 * once known.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

type DeadlineSpec = {
  entitySlug: string;
  kind: string;
  dueDate: string;
  notes?: string;
};

// Quarterly payroll-tax periods. Form 941, GA G-7 withholding, and GA
// DOL SUTA (DOL-4N) all share the same Apr 30 / Jul 31 / Oct 31 / Jan 31
// cadence — Q4 lands in the following year.
function payrollQuarters(year: number, nextYear: number) {
  return [
    { q: "Q1", due: `${year}-04-30`, taxYear: year },
    { q: "Q2", due: `${year}-07-31`, taxYear: year },
    { q: "Q3", due: `${year}-10-31`, taxYear: year },
    { q: "Q4", due: `${nextYear}-01-31`, taxYear: year },
  ];
}

function build(year: number): DeadlineSpec[] {
  const nextYear = year + 1;
  const out: DeadlineSpec[] = [];

  // Path to Change (S-corp)
  out.push(
    { entitySlug: "path-to-change", kind: "1120_s", dueDate: `${year}-03-15`, notes: `Form 1120-S federal for ${year}` },
    { entitySlug: "path-to-change", kind: "state_annual", dueDate: `${year}-04-01`, notes: `GA LLC annual report ${year}` },
    { entitySlug: "path-to-change", kind: "quarterly_estimated", dueDate: `${year}-04-15`, notes: `Q1 ${year}` },
    { entitySlug: "path-to-change", kind: "quarterly_estimated", dueDate: `${year}-06-15`, notes: `Q2 ${year}` },
    { entitySlug: "path-to-change", kind: "quarterly_estimated", dueDate: `${year}-09-15`, notes: `Q3 ${year}` },
    { entitySlug: "path-to-change", kind: "quarterly_estimated", dueDate: `${nextYear}-01-15`, notes: `Q4 ${year}` },
    { entitySlug: "path-to-change", kind: "1099_due", dueDate: `${nextYear}-01-31`, notes: `1099-NEC to contractors for ${year}` },
    { entitySlug: "path-to-change", kind: "w2_due", dueDate: `${nextYear}-01-31`, notes: `W-2 to employees + SSA e-file for ${year}` },
  );

  // Path to Change payroll-tax filings — only applicable while Path to
  // Change has W-2 employees. EFTPS handles the underlying federal deposits
  // on a monthly or semi-weekly schedule; the Form 941 quarterly return is
  // the user-facing deadline we surface here.
  for (const q of payrollQuarters(year, nextYear)) {
    out.push(
      { entitySlug: "path-to-change", kind: "941_quarterly", dueDate: q.due, notes: `Form 941 ${q.q} ${q.taxYear} via EFTPS — federal employment tax` },
      { entitySlug: "path-to-change", kind: "ga_g7_withholding", dueDate: q.due, notes: `GA G-7 ${q.q} ${q.taxYear} — state withholding (Georgia Tax Center)` },
      { entitySlug: "path-to-change", kind: "ga_suta", dueDate: q.due, notes: `GA DOL-4N ${q.q} ${q.taxYear} — SUTA (GA DOL)` },
      // FUTA tax deposits trigger if Q-end balance owed > $500; the
      // Form 940 annual return is below. Surface the deposit due dates
      // so Lance knows when the trigger date hits even if he doesn't
      // file. Memo notes that deposit only required at $500 threshold.
      { entitySlug: "path-to-change", kind: "futa_deposit", dueDate: q.due, notes: `FUTA deposit ${q.q} ${q.taxYear} via EFTPS — only required if accrued FUTA > $500` },
    );
  }

  // FUTA annual return (Form 940) — always due regardless of deposit
  // threshold. Lance e-files via EFTPS.
  out.push({
    entitySlug: "path-to-change",
    kind: "940_annual",
    dueDate: `${nextYear}-01-31`,
    notes: `Form 940 ${year} — annual FUTA federal unemployment tax`,
  });

  // EFTPS monthly deposits — covers federal income tax withheld + SSA +
  // Medicare (employee + employer FICA). Assumes monthly depositor schedule
  // (≤ $50K lookback). If Lance becomes a semi-weekly depositor, swap to
  // the semi-weekly cadence (more frequent, more complex).
  // Deposit due: 15th of the month FOLLOWING the pay period.
  for (let m = 1; m <= 12; m++) {
    const dueMonth = m === 12 ? 1 : m + 1;
    const dueYear = m === 12 ? nextYear : year;
    const mm = String(dueMonth).padStart(2, "0");
    out.push({
      entitySlug: "path-to-change",
      kind: "eftps_deposit",
      dueDate: `${dueYear}-${mm}-15`,
      notes: `EFTPS monthly deposit for ${String(m).padStart(2, "0")}/${year} pay periods — federal withholding + SSA + Medicare`,
    });
  }

  // PTC Havens / H&L Place of Grace / H&L Havens — GA LLC annual reports
  for (const slug of ["ptc-havens", "hl-place-of-grace", "hl-havens"]) {
    out.push({
      entitySlug: slug,
      kind: "state_annual",
      dueDate: `${year}-04-01`,
      notes: `GA LLC annual report ${year}`,
    });
  }

  // CFS (sole prop) — files Schedule C with 1040, but the deadline lives on
  // Personal Joint. CFS gets the contractor / kid-W-2 deadlines.
  out.push(
    { entitySlug: "cfs", kind: "1099_due", dueDate: `${nextYear}-01-31`, notes: `1099-NEC to contractors for ${year}` },
    { entitySlug: "cfs", kind: "w2_due", dueDate: `${nextYear}-01-31`, notes: `Kid-employee W-2s + SSA e-file for ${year}` },
  );

  // Personal Joint (1040)
  out.push(
    { entitySlug: "personal-joint", kind: "1040", dueDate: `${year}-04-15`, notes: `Form 1040 federal for ${year - 1} (filed in ${year})` },
    { entitySlug: "personal-joint", kind: "quarterly_estimated", dueDate: `${year}-04-15`, notes: `Q1 ${year} estimated personal tax` },
    { entitySlug: "personal-joint", kind: "quarterly_estimated", dueDate: `${year}-06-15`, notes: `Q2 ${year} estimated personal tax` },
    { entitySlug: "personal-joint", kind: "quarterly_estimated", dueDate: `${year}-09-15`, notes: `Q3 ${year} estimated personal tax` },
    { entitySlug: "personal-joint", kind: "quarterly_estimated", dueDate: `${nextYear}-01-15`, notes: `Q4 ${year} estimated personal tax` },
  );

  return out;
}

async function main() {
  const { db } = await import("../src/lib/db/index.js");
  const { entities, taxDeadlines } = await import("../src/lib/db/schema.js");
  const { eq, and } = await import("drizzle-orm");

  const arg = process.argv[2];
  const cur = new Date().getFullYear();
  const years = arg ? [Number(arg)] : [cur, cur + 1];

  const ents = await db.select().from(entities);
  const slugToId = new Map(ents.map((e) => [e.slug, e.id]));

  let inserted = 0;
  let skipped = 0;

  for (const y of years) {
    const specs = build(y);
    console.log(`\n${y}: ${specs.length} deadlines to consider`);

    for (const spec of specs) {
      const entityId = slugToId.get(spec.entitySlug);
      if (!entityId) {
        console.warn(`  skip "${spec.notes}": entity ${spec.entitySlug} not seeded`);
        skipped++;
        continue;
      }
      const existing = await db
        .select({ id: taxDeadlines.id })
        .from(taxDeadlines)
        .where(
          and(
            eq(taxDeadlines.entityId, entityId),
            eq(taxDeadlines.kind, spec.kind),
            eq(taxDeadlines.dueDate, spec.dueDate)
          )
        );
      if (existing.length > 0) {
        skipped++;
        continue;
      }
      await db.insert(taxDeadlines).values({
        entityId,
        kind: spec.kind,
        dueDate: spec.dueDate,
        notes: spec.notes ?? null,
        status: "open",
      });
      inserted++;
      console.log(`  + ${spec.dueDate}  ${spec.entitySlug}  ${spec.kind}  ${spec.notes ?? ""}`);
    }
  }

  console.log(`\nInserted ${inserted} deadlines · ${skipped} already existed or skipped\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
