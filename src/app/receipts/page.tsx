import { Placeholder } from "../_components/placeholder";

export default function ReceiptsPage() {
  return (
    <Placeholder
      title="Receipts"
      description="Killer feature #3 — drop a receipt photo, Claude classifies it, system auto-matches to a card transaction within ±$0.50 / ±5 days."
      checklist={[
        "Drop folder watcher: …/Tax Ledger Drop/receipts/<entity-slug>/",
        "Phone upload route (PWA): /receipts/upload",
        "Claude extracts merchant / purchase_date / total_cents / tax_cents / tip_cents",
        "Auto-match on entity + amount + date window; link receipt ↔ transaction both ways",
        "Cross-entity flag when receipt entity != matched transaction entity (wrong card / wrong folder / wrong tag)",
        "Unmatched queue: card txn hasn't imported yet vs cash receipt vs duplicate",
        "has_receipt column in CPA CSV export",
      ]}
    />
  );
}
