import { Placeholder } from "../_components/placeholder";

export default function TransactionsPage() {
  return (
    <Placeholder
      title="Transactions"
      description="The canonical ledger. Imported statement + card lines are the source of truth; manual entries get matched against them."
      checklist={[
        "Table filterable by entity, account, date range, category, contractor, employee, property tag",
        "Inline contractor / employee tagging (drives the 1099 + W-2 views)",
        "Status pill: auto-categorized vs needs review",
        "Per-row attached-receipt thumbnail when matched",
        "Click row → drawer with raw description, source statement, edit category / tag",
      ]}
    />
  );
}
