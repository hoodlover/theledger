import { Page, PageHeader, EmptyState, Callout } from "@/components/ui";

export const dynamic = "force-dynamic";

export default function ReceiptsPage() {
  return (
    <Page>
      <PageHeader
        title="Receipts"
        subtitle="Killer feature #3 — drop a receipt photo, Claude classifies it, system auto-matches to a card transaction within ±$0.50 / ±5 days."
      />
      <EmptyState
        title="No receipts yet"
        description="Receipts that already live in cobbvault's Vercel Blob will surface here after the backfill. Heather can also pin /receipts/upload to her home screen for phone uploads."
      />
      <div className="mt-8">
        <Callout title="v0 checklist">
          <ul className="mt-1 list-disc space-y-1 pl-5">
            <li>Drop folder watcher: …/Tax Ledger Drop/receipts/&lt;entity-slug&gt;/</li>
            <li>Phone upload route (PWA): /receipts/upload</li>
            <li>Claude extracts merchant / purchase_date / total / tax / tip</li>
            <li>Auto-match on entity + amount + date window; link both sides</li>
            <li>Cross-entity flag when receipt entity ≠ matched transaction entity</li>
            <li>Unmatched queue: card txn hasn’t imported yet vs cash receipt vs duplicate</li>
            <li>has_receipt column in CPA CSV export</li>
          </ul>
        </Callout>
      </div>
    </Page>
  );
}
