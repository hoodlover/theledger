import Link from "next/link";
import { db } from "@/lib/db";
import {
  transactions,
  bankAccounts,
  entities,
  contractors,
  employees,
} from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";
import { Money, StatusPill } from "@/components/ui";
import { DrawerForms, DrawerClose, DrawerBackdrop } from "./_drawer-client";

// Server component — fetches everything the drawer needs, then hands the
// interactive bits down to client children.

export async function TransactionDrawer({
  txnId,
  returnHref,
}: {
  txnId: string;
  returnHref: string;
}) {
  const row = (
    await db
      .select({
        txn: transactions,
        accountName: bankAccounts.displayName,
        accountInstitution: bankAccounts.institution,
        accountKind: bankAccounts.kind,
        accountLast4: bankAccounts.last4,
        entityName: entities.name,
        entityId: entities.id,
      })
      .from(transactions)
      .innerJoin(bankAccounts, eq(bankAccounts.id, transactions.bankAccountId))
      .innerJoin(entities, eq(entities.id, transactions.entityId))
      .where(eq(transactions.id, txnId))
  )[0];

  if (!row) {
    return (
      <DrawerShell returnHref={returnHref}>
        <div className="p-6 text-sm text-[var(--muted)]">
          Transaction not found.
        </div>
      </DrawerShell>
    );
  }

  const { txn, accountName, accountInstitution, accountKind, accountLast4, entityName, entityId } = row;

  // Existing contractors + employees (entity-scoped) for the autocomplete
  const [entityContractors, entityEmployees, currentContractor, currentEmployee] =
    await Promise.all([
      db
        .select({ id: contractors.id, name: contractors.legalName })
        .from(contractors)
        .where(eq(contractors.entityId, entityId))
        .orderBy(asc(contractors.legalName)),
      db
        .select({
          id: employees.id,
          name: employees.legalName,
          kind: employees.employeeKind,
        })
        .from(employees)
        .where(eq(employees.entityId, entityId))
        .orderBy(asc(employees.legalName)),
      txn.contractorId
        ? db
            .select({ id: contractors.id, name: contractors.legalName })
            .from(contractors)
            .where(eq(contractors.id, txn.contractorId))
        : Promise.resolve([]),
      txn.employeeId
        ? db
            .select({
              id: employees.id,
              name: employees.legalName,
              kind: employees.employeeKind,
            })
            .from(employees)
            .where(eq(employees.id, txn.employeeId))
        : Promise.resolve([]),
    ]);

  const contractor = currentContractor[0];
  const employee = currentEmployee[0];

  return (
    <DrawerShell returnHref={returnHref}>
      <div className="flex h-full flex-col">
        <header className="flex items-center justify-between gap-4 border-b border-[var(--border)] px-5 py-4">
          <div>
            <div className="text-xs uppercase tracking-wide text-[var(--muted)]">
              Transaction
            </div>
            <div className="mt-1 flex items-baseline gap-3">
              <div className="tabular text-sm text-[var(--muted)]">
                {txn.postedDate}
              </div>
              <div className="text-lg font-semibold">
                <Money cents={txn.amountCents} signed />
              </div>
            </div>
          </div>
          <DrawerClose returnHref={returnHref} />
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
          <section>
            <div className="text-base font-semibold">
              {txn.normalizedMerchant ?? "—"}
            </div>
            <div className="mt-1 text-sm text-[var(--muted)] break-words">
              {txn.rawDescription}
            </div>
          </section>

          <section>
            <FieldLabel>Account</FieldLabel>
            <div className="mt-1 text-sm">{accountName}</div>
            <div className="mt-1 text-xs text-[var(--muted)]">
              {accountInstitution} · {accountKind}
              {accountLast4 !== "TBD" ? ` · ••${accountLast4}` : ""} ·{" "}
              {entityName}
            </div>
          </section>

          <section className="flex flex-wrap gap-2">
            {contractor ? (
              <StatusPill tone="accent">
                Contractor: {contractor.name}
              </StatusPill>
            ) : null}
            {employee ? (
              <StatusPill tone="accent">
                Employee: {employee.name}
                {employee.kind === "minor_child" ? " (minor)" : ""}
              </StatusPill>
            ) : null}
            {txn.isInterEntityTransfer ? (
              <StatusPill tone="warning">Inter-entity transfer</StatusPill>
            ) : null}
            {!contractor &&
              !employee &&
              !txn.isInterEntityTransfer && (
                <StatusPill tone="neutral">Needs review</StatusPill>
              )}
          </section>

          <DrawerForms
            transactionId={txn.id}
            contractor={contractor ?? null}
            employee={employee ?? null}
            allContractors={entityContractors}
            allEmployees={entityEmployees}
            isTransfer={txn.isInterEntityTransfer}
            notes={txn.notes ?? ""}
          />
        </div>
      </div>
    </DrawerShell>
  );
}

function DrawerShell({
  children,
  returnHref,
}: {
  children: React.ReactNode;
  returnHref: string;
}) {
  return (
    <>
      <DrawerBackdrop returnHref={returnHref} />
      <aside
        className="fixed right-0 top-0 z-40 h-full w-full max-w-md border-l border-[var(--border)] bg-[var(--background)] shadow-2xl"
        aria-label="Transaction details"
      >
        {children}
      </aside>
    </>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
      {children}
    </div>
  );
}
