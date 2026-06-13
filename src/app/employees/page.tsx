import { Page, PageHeader, EmptyState, Callout } from "@/components/ui";

export const dynamic = "force-dynamic";

export default function EmployeesPage() {
  return (
    <Page>
      <PageHeader
        title="Employees"
        subtitle="Killer feature #2 — Path to Change W-2s alongside CFS minor-child employees with FICA-exempt headroom."
      />
      <EmptyState
        title="No employees yet"
        description="Add W-2 employees under Path to Change and minor children under CFS. Pay categories are effective-dated so a raise creates a new row instead of mutating history."
      />
      <div className="mt-8">
        <Callout title="v0 checklist">
          <ul className="mt-1 list-disc space-y-1 pl-5">
            <li>Path to Change W-2 table: YTD wages, pay rate, withholding profile</li>
            <li>CFS minor-employee table: age, YTD, remaining standard-deduction headroom</li>
            <li>Roth IRA capacity row on each kid profile</li>
            <li>Flag minor-employee rows so payroll export does not withhold FICA</li>
          </ul>
        </Callout>
      </div>
    </Page>
  );
}
