import { Page, PageHeader, EmptyState, Callout } from "@/components/ui";

export const dynamic = "force-dynamic";

export default function TransfersPage() {
  return (
    <Page>
      <PageHeader
        title="Inter-entity transfers"
        subtitle="Rent (PTC Havens ← Path to Change), cleaning (CFS ← Path to Change), kid wages (CFS → kid). One transfer event with two stitched sides."
      />
      <EmptyState
        title="No transfers yet"
        description="Standing rules pre-create transfer rows; statement imports match them to real txns. Build comes after we have txns to match."
      />
      <div className="mt-8">
        <Callout title="v0 checklist">
          <ul className="mt-1 list-disc space-y-1 pl-5">
            <li>Standing rules: cadence, default amount, purpose</li>
            <li>Rule pre-creates transfer rows; statement import matches them to real txns</li>
            <li>Two-sided view: from-entity expense + to-entity income, both linked</li>
            <li>“Needs match” queue when only one side has imported</li>
            <li>Per-entity report: total income from / expenses to each related entity</li>
          </ul>
        </Callout>
      </div>
    </Page>
  );
}
