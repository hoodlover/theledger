// Inflation-adjusted tax constants per year. Update when the IRS publishes
// new values — these are used to compute headroom + capacity, not to file
// returns, so a small lag won't break anything important.

export const STANDARD_DEDUCTION_SINGLE: Record<number, number> = {
  // single filer (which is what a minor child files as)
  2024: 14_600_00,
  2025: 15_000_00,
  2026: 15_500_00, // Verify when IRS publishes Rev. Proc. for 2026
};

export const ROTH_IRA_CONTRIB_LIMIT: Record<number, number> = {
  // contribution cap for filers under 50
  2024: 7_000_00,
  2025: 7_000_00,
  2026: 7_500_00, // Verify
};

export const NINETEEN_NINETY_NINE_NEC_THRESHOLD_CENTS = 60_000; // $600

// IRS standard mileage rate (cents per mile, business use).
// https://www.irs.gov/tax-professionals/standard-mileage-rates
export const STANDARD_MILEAGE_RATE_CENTS_PER_MILE: Record<number, number> = {
  2024: 67,
  2025: 70,
  2026: 70, // TBD — IRS publishes in late Dec; using 2025 placeholder
};

export function mileageRatePerMile(year: number): number {
  return (
    STANDARD_MILEAGE_RATE_CENTS_PER_MILE[year] ??
    STANDARD_MILEAGE_RATE_CENTS_PER_MILE[
      Math.max(
        ...Object.keys(STANDARD_MILEAGE_RATE_CENTS_PER_MILE).map(Number)
      )
    ]
  );
}

export function standardDeductionSingle(year: number): number {
  return (
    STANDARD_DEDUCTION_SINGLE[year] ??
    STANDARD_DEDUCTION_SINGLE[
      Math.max(...Object.keys(STANDARD_DEDUCTION_SINGLE).map(Number))
    ]
  );
}

export function rothIraLimit(year: number): number {
  return (
    ROTH_IRA_CONTRIB_LIMIT[year] ??
    ROTH_IRA_CONTRIB_LIMIT[
      Math.max(...Object.keys(ROTH_IRA_CONTRIB_LIMIT).map(Number))
    ]
  );
}

export function ageOn(dob: string | null | undefined, asOf: Date): number | null {
  if (!dob) return null;
  const [y, m, d] = dob.split("-").map(Number);
  if (!y || !m || !d) return null;
  let age = asOf.getFullYear() - y;
  const beforeBirthday =
    asOf.getMonth() + 1 < m ||
    (asOf.getMonth() + 1 === m && asOf.getDate() < d);
  if (beforeBirthday) age--;
  return age;
}
