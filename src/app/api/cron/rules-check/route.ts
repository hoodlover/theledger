/**
 * Cron mirror of `npm run rules:check` — pure report, no DB writes.
 * Compares each active standing_transfer_rule's expected dates against
 * existing inter_entity_transfers rows in the trailing 12 months.
 *
 * Trigger via Vercel cron or manually with ?key=<CRON_SECRET>.
 */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import {
  entities,
  standingTransferRules,
  interEntityTransfers,
} from "@/lib/db/schema";
import { and, eq, gte, lte } from "drizzle-orm";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TRAILING_MONTHS = 12;
const MATCH_WINDOW_DAYS = 15;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  if (req.headers.get("authorization") === `Bearer ${secret}`) return true;
  if (req.nextUrl.searchParams.get("key") === secret) return true;
  return false;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function withDay(year: number, monthZero: number, day: number): Date {
  const probe = new Date(Date.UTC(year, monthZero + 1, 0));
  return new Date(Date.UTC(year, monthZero, Math.min(day, probe.getUTCDate())));
}

function expectedDates(cadence: string, startISO: string, asOf: Date): string[] {
  const out: string[] = [];
  const start = new Date(startISO + "T00:00:00Z");
  if (cadence === "monthly") {
    let cursor = new Date(start);
    while (cursor <= asOf) {
      out.push(isoDate(cursor));
      cursor = withDay(
        cursor.getUTCFullYear(),
        cursor.getUTCMonth() + 1,
        start.getUTCDate()
      );
    }
  } else if (cadence === "semi_monthly") {
    let y = start.getUTCFullYear();
    let m = start.getUTCMonth();
    while (true) {
      const a = new Date(Date.UTC(y, m, 1));
      const b = new Date(Date.UTC(y, m, 15));
      if (a > asOf) break;
      if (a >= start) out.push(isoDate(a));
      if (b <= asOf && b >= start) out.push(isoDate(b));
      m++;
      if (m > 11) {
        m = 0;
        y++;
      }
    }
  } else if (cadence === "annual") {
    let y = start.getUTCFullYear();
    while (true) {
      const d = withDay(y, start.getUTCMonth(), start.getUTCDate());
      if (d > asOf) break;
      if (d >= start) out.push(isoDate(d));
      y++;
    }
  }
  return out;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return new Response("unauthorized", { status: 401 });

  const asOf = new Date();
  const earliest = new Date(asOf);
  earliest.setUTCMonth(earliest.getUTCMonth() - TRAILING_MONTHS);

  const rules = await db
    .select()
    .from(standingTransferRules)
    .where(eq(standingTransferRules.active, true));

  const allEntities = await db.select().from(entities);
  const entityName = new Map(allEntities.map((e) => [e.id, e.name]));

  let totalExpected = 0;
  let totalMatched = 0;
  let totalMissing = 0;
  const missingByRule: { rule: string; missingDates: string[] }[] = [];

  for (const rule of rules) {
    const expected = expectedDates(
      rule.cadence,
      isoDate(earliest),
      asOf
    );
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

    const claimed = new Set<string>();
    const missing: string[] = [];
    for (const expDate of expected) {
      const exp = new Date(expDate + "T00:00:00Z");
      const hit = existing.find((e) => {
        if (claimed.has(e.id)) return false;
        const got = new Date(e.occurredOn + "T00:00:00Z");
        return (
          Math.abs((got.getTime() - exp.getTime()) / 86_400_000) <=
          MATCH_WINDOW_DAYS
        );
      });
      if (hit) {
        claimed.add(hit.id);
      } else {
        missing.push(expDate);
      }
    }

    totalExpected += expected.length;
    totalMatched += claimed.size;
    totalMissing += missing.length;

    if (missing.length) {
      const from = entityName.get(rule.fromEntityId) ?? rule.fromEntityId;
      const to = entityName.get(rule.toEntityId) ?? rule.toEntityId;
      missingByRule.push({
        rule: `${rule.purpose} · ${rule.cadence} · ${from} → ${to}`,
        missingDates: missing,
      });
    }
  }

  const summary = {
    rulesChecked: rules.length,
    totalExpected,
    totalMatched,
    totalMissing,
    missingByRule,
  };

  await logAudit({
    eventKind: "cron.rules_check",
    summary: `Standing rules: ${totalMissing} missing across ${rules.length} rules`,
    meta: summary,
  });

  return Response.json(summary);
}

export { GET as POST };
