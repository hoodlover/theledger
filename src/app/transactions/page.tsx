import { Page, PageHeader, EmptyState, Callout } from "@/components/ui";
import { getActiveScope } from "@/lib/scope";

export const dynamic = "force-dynamic";

export default async function TransactionsPage() {
  const scope = await getActiveScope();
  return (
    <Page>
      <PageHeader
        title="Transactions"
        subtitle="The canonical ledger. Imported statement and card lines are the source of truth; manual entries get matched against them."
      />
      <EmptyState
        title="No transactions yet"
        description={
          scope.entity
            ? `${scope.entity.name} has no transactions imported. Drop a statement (or wait for the cobbvault blob backfill).`
            : "Drop a statement under DROP_FOLDER_PATH, or run the cobbvault blob backfill (next chunk)."
        }
      />
      <div className="mt-8">
        <Callout title="v0 checklist">
          <ul className="mt-1 list-disc space-y-1 pl-5">
            <li>Table filterable by entity, account, date, category, contractor, employee, property tag</li>
            <li>Inline contractor / employee tagging drives the 1099 + W-2 views</li>
            <li>Status pill: auto-categorized vs needs review</li>
            <li>Per-row attached-receipt thumbnail when matched</li>
            <li>Click row → drawer with raw description, source statement, edit category</li>
          </ul>
        </Callout>
      </div>
    </Page>
  );
}
