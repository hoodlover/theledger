import { Placeholder } from "../_components/placeholder";

export default function EmployeesPage() {
  return (
    <Placeholder
      title="Employees"
      description="Killer feature #2 — Path to Change W-2s alongside CFS minor-child employees with FICA-exempt headroom."
      checklist={[
        "Path to Change W-2 table: YTD wages, pay rate, withholding profile (GA-M1, GA-S0, etc.)",
        "CFS minor-employee table: age, YTD wages, no-federal-withholding flag, remaining standard-deduction headroom",
        "Roth IRA capacity row on each kid profile (earned income = contribution cap)",
        "Effective-dated pay categories so a raise creates a new row instead of mutating history",
        "Flag minor-employee rows so payroll export does not withhold FICA",
      ]}
    />
  );
}
