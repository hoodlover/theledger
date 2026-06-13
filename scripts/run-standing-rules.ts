/**
 * Standing-rule scheduler / report.
 *
 *   npm run rules:check          # dry run — report missing periods
 *   npm run rules:check -- --commit   # also pre-create pending inter_entity_transfers
 *
 * For every active standing_transfer_rule, computes the expected
 * occurrence dates for the trailing 12 months at the rule's cadence
 * (monthly / semi-monthly / annual). For each expected date, looks up
 * any existing inter_entity_transfers row with the same from→to entities
 * occurring within ±15 days. Missing periods get reported. With --commit,
 * a pending inter_entity_transfers row (no from_tx / to_tx) is inserted
 * so the next statement import can match it on amount + date.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

const COMMIT = process.argv.includes("--commit");
const DRY_RUN = !COMMIT;
const TRAILING_MONTHS = 12;
const MATCH_WINDOW_DAYS = 15;

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + days);
  return x;
}

function withDay(year: number, monthZeroIdx: number, day: number): Date {
  // Clamp to last day of the month (e.g. Feb 30 → Feb 28/29)
  const probe = new Date(Date.UTC(year, monthZeroIdx + 1, 0));
  return new Date(Date.UTC(year, monthZeroIdx, Math.min(day, probe.getUTCDate())));
}

function expectedDatesForRule(
  cadence: string,
  startISO: string,
  asOf: Date
): string[] {
  const dates: string[] = [];
  const start = new Date(startISO + "T00:00:00Z");
  const startDay = start.getUTCDate();

  // Walk forwards from start until asOf
  if (cadence === "monthly") {
    let cursor = new Date(start);
    while (cursor <= asOf) {
      dates.push(isoDate(cursor));
      cursor = withDay(
        cursor.getUTCFullYear(),
        cursor.getUTCMonth() + 1,
        startDay
      );
    }
  } else if (cadence === "semi_monthly") {
    // 1st + 15th of each month from start's month onward
    let y = start.getUTCFullYear();
    let m = start.getUTCMonth();
    while (true) {
      const a = new Date(Date.UTC(y, m, 1));
      const b = new Date(Date.UTC(y, m, 15));
      if (a > asOf) break;
      if (a >= start) dates.push(isoDate(a));
      if (b <= asOf && b >= start) dates.push(isoDate(b));
      m++;
      if (m > 11) {
        m = 0;
        y++;
      }
    }
  } else if (cadence === "annual") {
    let y = start.getUTCFullYear();
    while (true) {
      const d = withDay(y, start.getUTCMonth(), startDay);
      if (d > asOf) break;
      if (d >= start) dates.push(isoDate(d));
      y++;
    }
  }
  return dates;
}

async function main() {
  const { db } = await import("../src/lib/db/index.js");
  const { entities, standingTransferRules, interEntityTransfers } = await import(
    "../src/lib/db/schema.js"
  );
  const { eq, and, gte, lte } = await import("drizzle-orm");

  console.log(`\n${DRY_RUN ? "DRY RUN" : "LIVE"} — standing-rule check\n`);

  const allEntities = await db.select().from(entities);
  const entityName = new Map(allEntities.map((e) => [e.id, e.name]));

  const rules = await db
    .select()
    .from(standingTransferRules)
    .where(eq(standingTransferRules.active, true));

  if (rules.length === 0) {
    console.log("No active standing rules. Set them up on /transfers.");
    return;
  }

  const asOf = new Date();
  const earliest = new Date(asOf);
  earliest.setUTCMonth(earliest.getUTCMonth() - TRAILING_MONTHS);

  let totalMissing = 0;
  let totalInserted = 0;

  for (const rule of rules) {
    const from = entityName.get(rule.fromEntityId) ?? rule.fromEntityId;
    const to = entityName.get(rule.toEntityId) ?? rule.toEntityId;
    const tag = `[${rule.purpose} · ${rule.cadence}] ${from} → ${to}`;

    // Use earliest of (earliest, rule's earliest existing transfer or asOf - 12mo)
    const expected = expectedDatesForRule(
      rule.cadence,
      isoDate(earliest),
      asOf
    );

    if (expected.length === 0) {
      console.log(`  ${tag} — no expected periods yet`);
      continue;
    }

    // Pull every existing transfer in window for this from→to pair
    const existing = await db
      .select({
        id: interEntityTransfers.id,
        occurredOn: interEntityTransfers.occurredOn,
      })
      .from(interEntityTransfers)
      .where(
        and(
          eq(interEntityTransfers.fromEntityId, rule.fromEntityId),
          eq(interEntityTransfers.toEntityId, rule.toEntityId),
          gte(interEntityTransfers.occurredOn, isoDate(earliest)),
          lte(interEntityTransfers.occurredOn, isoDate(asOf))
        )
      );

    const matchedExisting = new Set<string>();
    const missing: string[] = [];
    for (const expDateISO of expected) {
      const exp = new Date(expDateISO + "T00:00:00Z");
      const hit = existing.find((e) => {
        if (matchedExisting.has(e.id)) return false;
        const got = new Date(e.occurredOn + "T00:00:00Z");
        const diffDays = Math.abs(
          (got.getTime() - exp.getTime()) / 86_400_000
        );
        return diffDays <= MATCH_WINDOW_DAYS;
      });
      if (hit) {
        matchedExisting.add(hit.id);
      } else {
        missing.push(expDateISO);
      }
    }

    console.log(`\n  ${tag}`);
    console.log(
      `    ${expected.length} expected · ${matchedExisting.size} have a transfer · ${missing.length} missing`
    );
    for (const m of missing) {
      console.log(`      missing: ${m}`);
      totalMissing++;
    }

    if (COMMIT && missing.length > 0) {
      // Pre-create pending transfer rows. The pair detector on /transfers
      // can match on amount + date when both sides import.
      const rows = missing.map((dateISO) => ({
        occurredOn: dateISO,
        fromEntityId: rule.fromEntityId,
        toEntityId: rule.toEntityId,
        amountCents: rule.defaultAmountCents ?? 0,
        purpose: rule.purpose,
        standingRuleId: rule.id,
        fromTransactionId: null,
        toTransactionId: null,
        notes: `Auto-created by standing rule check ${isoDate(asOf)}`,
      }));
      await db.insert(interEntityTransfers).values(rows);
      totalInserted += rows.length;
    }
  }

  console.log(
    `\n${totalMissing} missing periods across ${rules.length} rules`
  );
  if (!DRY_RUN) {
    console.log(`Inserted ${totalInserted} pending transfer rows.`);
  } else {
    console.log(`Re-run with --commit to pre-create pending transfer rows.`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
