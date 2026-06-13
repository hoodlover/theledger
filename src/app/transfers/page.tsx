import Link from "next/link";
import { db } from "@/lib/db";
import {
  transactions,
  bankAccounts,
  entities,
  interEntityTransfers,
  standingTransferRules,
} from "@/lib/db/schema";
import { getActiveScope } from "@/lib/scope";
import { eq, sql, desc, asc } from "drizzle-orm";
import {
  Page,
  PageHeader,
  Card,
  StatTile,
  EmptyState,
  StatusPill,
  Money,
  Callout,
} from "@/components/ui";
import { CandidateRow, NewStandingRule, StandingRuleRow, ConfirmedRow } from "./_client";

export const dynamic = "force-dynamic";

const CANDIDATE_LIMIT = 50;
const DATE_WINDOW_DAYS = 5;

type CandidatePair = {
  fromTxnId: string;
  fromEntity: string;
  fromAccount: string;
  fromDate: string;
  fromMerchant: string | null;
  toTxnId: string;
  toEntity: string;
  toAccount: string;
  toDate: string;
  toMerchant: string | null;
  amountCents: number;
  dateDiffDays: number;
};

export default async function TransfersPage() {
  const scope = await getActiveScope();

  // Candidate pairs: same |amount|, opposite signs, dates within window,
  // entities differ, neither side already part of a confirmed transfer.
  const candidatesRaw = await db.execute<CandidatePair>(sql`
    WITH unconfirmed AS (
      SELECT t.*
        FROM transactions t
       WHERE t.is_inter_entity_transfer = false
    )
    SELECT
      a.id AS "fromTxnId",
      e_from.name AS "fromEntity",
      ba_from.display_name AS "fromAccount",
      a.posted_date AS "fromDate",
      a.normalized_merchant AS "fromMerchant",
      b.id AS "toTxnId",
      e_to.name AS "toEntity",
      ba_to.display_name AS "toAccount",
      b.posted_date AS "toDate",
      b.normalized_merchant AS "toMerchant",
      ABS(a.amount_cents)::int AS "amountCents",
      ABS(b.posted_date - a.posted_date)::int AS "dateDiffDays"
    FROM unconfirmed a
    JOIN unconfirmed b ON
      a.entity_id <> b.entity_id
      AND a.amount_cents = -b.amount_cents
      AND ABS(b.posted_date - a.posted_date) <= ${DATE_WINDOW_DAYS}
      AND a.amount_cents < 0  -- a is the sender (outflow)
      AND b.amount_cents > 0  -- b is the receiver (inflow)
    JOIN entities e_from   ON e_from.id   = a.entity_id
    JOIN entities e_to     ON e_to.id     = b.entity_id
    JOIN bank_accounts ba_from ON ba_from.id = a.bank_account_id
    JOIN bank_accounts ba_to   ON ba_to.id   = b.bank_account_id
    ${
      scope.entity
        ? sql`WHERE a.entity_id = ${scope.entity.id} OR b.entity_id = ${scope.entity.id}`
        : sql``
    }
    ORDER BY ABS(b.posted_date - a.posted_date), a.posted_date DESC
    LIMIT ${CANDIDATE_LIMIT}
  `);

  // neon-http's db.execute returns rows directly; serverless returns { rows }.
  // Be defensive about both shapes.
  const candidates: CandidatePair[] = Array.isArray(candidatesRaw)
    ? (candidatesRaw as unknown as CandidatePair[])
    : ((candidatesRaw as unknown as { rows: CandidatePair[] }).rows ?? []);

  const confirmed = await db
    .select({
      transfer: interEntityTransfers,
      fromEntity: sql<string>`(SELECT name FROM entities WHERE id = ${interEntityTransfers.fromEntityId})`,
      toEntity: sql<string>`(SELECT name FROM entities WHERE id = ${interEntityTransfers.toEntityId})`,
    })
    .from(interEntityTransfers)
    .orderBy(desc(interEntityTransfers.occurredOn))
    .limit(100);

  const rules = await db
    .select({
      rule: standingTransferRules,
      fromEntity: sql<string>`(SELECT name FROM entities WHERE id = ${standingTransferRules.fromEntityId})`,
      toEntity: sql<string>`(SELECT name FROM entities WHERE id = ${standingTransferRules.toEntityId})`,
    })
    .from(standingTransferRules)
    .orderBy(asc(standingTransferRules.purpose));

  const entityOptions = await db
    .select({ id: entities.id, name: entities.name })
    .from(entities)
    .orderBy(asc(entities.name));

  return (
    <Page>
      <PageHeader
        title="Inter-entity transfers"
        subtitle={
          scope.entity
            ? `Scoped to ${scope.entity.name}. Showing pairs involving this entity.`
            : "All entities. Pairs detected on equal-but-opposite amounts ±5 days."
        }
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <StatTile
          label="Confirmed transfers"
          value={confirmed.length.toLocaleString()}
        />
        <StatTile
          label="Standing rules"
          value={rules.length.toLocaleString()}
        />
        <StatTile
          label="Pair candidates"
          value={candidates.length.toLocaleString()}
          hint={candidates.length === CANDIDATE_LIMIT ? "showing first 50" : undefined}
          tone={candidates.length > 0 ? "warning" : "neutral"}
        />
      </div>

      {/* Candidates */}
      <section className="mb-10">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
          Suggested pairs to confirm
        </h2>
        {candidates.length === 0 ? (
          <EmptyState
            title="No unconfirmed candidate pairs"
            description="Either everything's reconciled, or no equal-but-opposite amounts landed across entities in the date window."
          />
        ) : (
          <Card>
            <ul className="divide-y divide-[var(--border)]">
              {candidates.map((c) => (
                <li key={`${c.fromTxnId}-${c.toTxnId}`} className="px-4 py-3">
                  <CandidateRow candidate={c} />
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>

      {/* Standing rules */}
      <section className="mb-10">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
          Standing rules
        </h2>
        <Card className="p-4">
          <NewStandingRule entities={entityOptions} />
        </Card>
        {rules.length > 0 && (
          <Card className="mt-3">
            <ul className="divide-y divide-[var(--border)]">
              {rules.map((r) => (
                <li key={r.rule.id} className="px-4 py-3">
                  <StandingRuleRow
                    rule={{
                      id: r.rule.id,
                      cadence: r.rule.cadence,
                      purpose: r.rule.purpose,
                      defaultAmountCents: r.rule.defaultAmountCents,
                      active: r.rule.active,
                      notes: r.rule.notes,
                    }}
                    fromEntity={r.fromEntity}
                    toEntity={r.toEntity}
                  />
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>

      {/* Confirmed */}
      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
          Confirmed transfers
        </h2>
        {confirmed.length === 0 ? (
          <EmptyState
            title="No transfers confirmed yet"
            description="Confirm a candidate above or mark a transaction inter-entity from its drawer."
          />
        ) : (
          <Card>
            <ul className="divide-y divide-[var(--border)]">
              {confirmed.map((t) => (
                <li key={t.transfer.id} className="px-4 py-3">
                  <ConfirmedRow
                    transferId={t.transfer.id}
                    fromEntity={t.fromEntity}
                    toEntity={t.toEntity}
                    occurredOn={t.transfer.occurredOn}
                    amountCents={t.transfer.amountCents}
                    purpose={t.transfer.purpose}
                    notes={t.transfer.notes}
                    fromTxnId={t.transfer.fromTransactionId}
                    toTxnId={t.transfer.toTransactionId}
                  />
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>
    </Page>
  );
}
