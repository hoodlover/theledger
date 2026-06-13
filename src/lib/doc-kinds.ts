// Shared catalog of document kinds for llc_paperwork. New kinds are safe
// to add — the column is a free-form text in v0; the UI uses this map for
// labels and grouping.

export const DOC_KINDS = [
  { kind: "operating_agreement", label: "Operating agreement", group: "Formation" },
  { kind: "ein_letter", label: "EIN letter (CP 575)", group: "Formation" },
  { kind: "annual_report", label: "Annual report", group: "Filings" },
  { kind: "state_filing", label: "State filing", group: "Filings" },
  { kind: "registered_agent", label: "Registered agent", group: "Filings" },
  { kind: "tax_return", label: "Tax return", group: "Tax" },
  { kind: "insurance_policy", label: "Insurance policy", group: "Property" },
  { kind: "mortgage_note", label: "Mortgage note", group: "Property" },
  { kind: "deed", label: "Deed", group: "Property" },
  { kind: "lease_agreement", label: "Lease agreement", group: "Property" },
  { kind: "w9", label: "W-9", group: "Contractor" },
  { kind: "misc", label: "Misc.", group: "Other" },
] as const;

export type DocKind = (typeof DOC_KINDS)[number]["kind"];

export const DOC_KIND_LABEL: Record<string, string> = Object.fromEntries(
  DOC_KINDS.map((d) => [d.kind, d.label])
);

export const DOC_KIND_GROUP: Record<string, string> = Object.fromEntries(
  DOC_KINDS.map((d) => [d.kind, d.group])
);
