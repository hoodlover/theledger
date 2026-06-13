import { Page, PageHeader, EmptyState, Callout } from "@/components/ui";

export const dynamic = "force-dynamic";

export default function ContractorsPage() {
  return (
    <Page>
      <PageHeader
        title="1099 contractors"
        subtitle="Killer feature #1 — answers “what did Path to Change actually pay each 1099 in 2026?” in one click."
      />
      <EmptyState
        title="No contractors yet"
        description="Contractors get added here once the cobbvault blob backfill lands. Tag transactions to a contractor and the YTD total computes itself."
      />
      <div className="mt-8">
        <Callout title="v0 checklist">
          <ul className="mt-1 list-disc space-y-1 pl-5">
            <li>Per-entity list: contractor, YTD total, payment count, W-9 status</li>
            <li>Warning row when YTD ≥ $600 and W-9 missing</li>
            <li>Click contractor → every tagged transaction</li>
            <li>Generate 1099 packet → Track1099 / Tax1099-ready CSV</li>
            <li>W-9 file upload + storage on contractor record</li>
          </ul>
        </Callout>
      </div>
    </Page>
  );
}
