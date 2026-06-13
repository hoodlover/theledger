import { Placeholder } from "../_components/placeholder";

export default function TransfersPage() {
  return (
    <Placeholder
      title="Inter-entity transfers"
      description="Rent (PTC Havens ← Path to Change), cleaning (CFS ← Path to Change), kid wages (CFS → kid). One transfer event with two stitched sides — not two unconnected txns."
      checklist={[
        "Standing rules: cadence (monthly | semi_monthly | annual), default amount, purpose",
        "Rule pre-creates transfer rows; statement import matches them to real txns",
        "Two-sided view: from-entity expense + to-entity income, both linked to one transfer row",
        "'Needs match' queue when only one side has imported",
        "Per-entity report: total income from and expenses to each related entity",
      ]}
    />
  );
}
