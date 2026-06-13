// Straight-line MACRS depreciation helpers. Not a tax-filing engine —
// surfaces approximate annual & accumulated depreciation so Lance can
// eyeball whether the schedule he has matches reality.

export const MACRS_CLASSES = [
  { kind: "residential_27_5", label: "Residential rental — 27.5 yr SL", years: 27.5 },
  { kind: "commercial_39", label: "Commercial building — 39 yr SL", years: 39 },
  { kind: "land_none", label: "Land — not depreciable", years: null },
] as const;

export type MacrsClassKind = (typeof MACRS_CLASSES)[number]["kind"];

export const MACRS_LABEL: Record<string, string> = Object.fromEntries(
  MACRS_CLASSES.map((c) => [c.kind, c.label])
);

export function yearsForMacrs(kind: string | null | undefined): number | null {
  const m = MACRS_CLASSES.find((c) => c.kind === kind);
  return m?.years ?? null;
}

// Returns annual depreciation cents (constant over the recovery period,
// straight-line). null if not enough info OR class is non-depreciable.
export function annualDepreciationCents(
  basisCents: number | null,
  macrsClass: string | null
): number | null {
  if (!basisCents || basisCents <= 0) return null;
  const years = yearsForMacrs(macrsClass);
  if (!years || years <= 0) return null;
  return Math.round(basisCents / years);
}

// Accumulated depreciation through asOf (or today).
// Pro-rates the first calendar year from the in-service date (month
// convention — close enough for a dashboard estimate).
export function accumulatedDepreciationCents(
  basisCents: number | null,
  macrsClass: string | null,
  inServiceISO: string | null | undefined,
  asOf: Date = new Date()
): number | null {
  const annual = annualDepreciationCents(basisCents, macrsClass);
  if (annual == null || !inServiceISO) return null;
  const start = new Date(inServiceISO + "T00:00:00Z");
  if (asOf < start) return 0;

  // Whole years between start and asOf
  let years =
    asOf.getUTCFullYear() - start.getUTCFullYear() -
    (asOf.getUTCMonth() < start.getUTCMonth() ||
    (asOf.getUTCMonth() === start.getUTCMonth() && asOf.getUTCDate() < start.getUTCDate())
      ? 1
      : 0);
  if (years < 0) years = 0;

  // Partial-year fraction since last anniversary
  const lastAnniv = new Date(start);
  lastAnniv.setUTCFullYear(start.getUTCFullYear() + years);
  const nextAnniv = new Date(start);
  nextAnniv.setUTCFullYear(start.getUTCFullYear() + years + 1);
  const partial =
    (asOf.getTime() - lastAnniv.getTime()) /
    (nextAnniv.getTime() - lastAnniv.getTime());

  const recoveryYears = yearsForMacrs(macrsClass);
  if (!recoveryYears) return 0;
  const totalYearsAtMost = years + partial;
  const cappedYears = Math.min(totalYearsAtMost, recoveryYears);

  return Math.round(annual * cappedYears);
}

// Remaining basis after depreciation = basis - accumulated.
export function remainingBasisCents(
  basisCents: number | null,
  macrsClass: string | null,
  inServiceISO: string | null | undefined,
  asOf: Date = new Date()
): number | null {
  if (!basisCents) return null;
  const acc = accumulatedDepreciationCents(basisCents, macrsClass, inServiceISO, asOf);
  if (acc == null) return null;
  return Math.max(0, basisCents - acc);
}
