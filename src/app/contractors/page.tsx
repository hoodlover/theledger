import { Placeholder } from "../_components/placeholder";

export default function ContractorsPage() {
  return (
    <Placeholder
      title="1099 contractors"
      description="Killer feature #1 — answers 'what did Path to Change actually pay each 1099 in 2026?' in one click."
      checklist={[
        "Per-entity list: contractor name, YTD total (from transactions), payment count, W-9 status",
        "Warning row when YTD >= $600 and W-9 missing",
        "Click contractor → every tagged transaction with date, amount, source statement",
        "Generate 1099 packet → Track1099 / Tax1099-ready CSV export",
        "W-9 file upload + storage on contractor record",
      ]}
    />
  );
}
