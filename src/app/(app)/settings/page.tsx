import Link from "next/link";
import {
  Page,
  PageHeader,
  Card,
  SectionHeader,
  StatusPill,
  Callout,
} from "@/components/ui";
import { db } from "@/lib/db";
import {
  entities,
  bankAccounts,
  transactions,
  contractors,
  employees,
  receipts,
  manualEntries,
  llcPaperwork,
  taxDeadlines,
  mileageEntries,
  interEntityTransfers,
  standingTransferRules,
  users,
} from "@/lib/db/schema";
import { count } from "drizzle-orm";
import { getCurrentUser } from "@/lib/current-user";
import { ChangePasswordForm, SignOutEverywhereForm } from "./_client";

export const dynamic = "force-dynamic";

const ENV_VARS = [
  { name: "DATABASE_URL", required: true, purpose: "Neon Postgres" },
  { name: "SESSION_SECRET", required: true, purpose: "Auth cookie signing (32+ chars)" },
  { name: "BLOB_READ_WRITE_TOKEN", required: false, purpose: "Vercel Blob — receipt + W-9 + document uploads" },
  { name: "ANTHROPIC_API_KEY", required: false, purpose: "Claude classifier (receipts + statement watcher)" },
  { name: "COBBVAULT_DATABASE_URL", required: false, purpose: "Read-only sync source for cobbvault backfill" },
  { name: "DROP_FOLDER_PATH", required: false, purpose: "Local drop-folder watcher (CLI only, not on Vercel)" },
];

export default async function SettingsPage() {
  const me = await getCurrentUser();

  const [
    [{ value: entityCount }],
    [{ value: accountCount }],
    [{ value: txnCount }],
    [{ value: contractorCount }],
    [{ value: employeeCount }],
    [{ value: receiptCount }],
    [{ value: manualCount }],
    [{ value: deadlineCount }],
    [{ value: docCount }],
    [{ value: mileageCount }],
    [{ value: transferCount }],
    [{ value: ruleCount }],
    [{ value: userCount }],
  ] = await Promise.all([
    db.select({ value: count() }).from(entities),
    db.select({ value: count() }).from(bankAccounts),
    db.select({ value: count() }).from(transactions),
    db.select({ value: count() }).from(contractors),
    db.select({ value: count() }).from(employees),
    db.select({ value: count() }).from(receipts),
    db.select({ value: count() }).from(manualEntries),
    db.select({ value: count() }).from(taxDeadlines),
    db.select({ value: count() }).from(llcPaperwork),
    db.select({ value: count() }).from(mileageEntries),
    db.select({ value: count() }).from(interEntityTransfers),
    db.select({ value: count() }).from(standingTransferRules),
    db.select({ value: count() }).from(users),
  ]);

  const envStatus = ENV_VARS.map((v) => ({
    ...v,
    set: !!process.env[v.name],
  }));
  const missingRequired = envStatus.filter((v) => v.required && !v.set);

  const counts: { label: string; value: number; href?: string }[] = [
    { label: "Entities", value: entityCount, href: "/entities" },
    { label: "Bank accounts", value: accountCount, href: "/accounts" },
    { label: "Transactions", value: txnCount, href: "/transactions" },
    { label: "Contractors", value: contractorCount, href: "/contractors" },
    { label: "Employees", value: employeeCount, href: "/employees" },
    { label: "Receipts", value: receiptCount, href: "/receipts" },
    { label: "Manual entries", value: manualCount, href: "/quick-entry" },
    { label: "Inter-entity transfers", value: transferCount, href: "/transfers" },
    { label: "Standing rules", value: ruleCount, href: "/transfers" },
    { label: "Tax deadlines", value: deadlineCount, href: "/deadlines" },
    { label: "Documents", value: docCount, href: "/docs" },
    { label: "Mileage entries", value: mileageCount, href: "/mileage" },
    { label: "Users", value: userCount },
  ];

  const ROUTES = [
    { href: "/", label: "Dashboard", what: "Family-office overview: hero + KPIs + entity cards" },
    { href: "/quick-entry", label: "Quick entry", what: "Heather's mobile-first manual entry, auto-matches on import" },
    { href: "/reconcile", label: "Reconcile", what: "Inbox-to-zero queue for receipts + manual entries + transfer pairs" },
    { href: "/mileage", label: "Mileage", what: "Trip log with IRS standard-rate deduction math" },
    { href: "/transactions", label: "Transactions", what: "Canonical ledger with drawer + tagging + amount search" },
    { href: "/contractors", label: "1099 contractors", what: "$600 warnings, YTD totals, Tax1099-ready CSV export" },
    { href: "/employees", label: "Employees", what: "W-2 + minor-child with Roth IRA + std-deduction headroom" },
    { href: "/transfers", label: "Inter-entity transfers", what: "Pair detector + standing rules" },
    { href: "/receipts", label: "Receipts", what: "Phone upload + Claude classify + auto-match" },
    { href: "/imports", label: "Statement imports", what: "Drop-folder watcher log" },
    { href: "/deadlines", label: "Tax deadlines", what: "1120-S, 1040, 941, 940, EFTPS, G-7, SUTA, more" },
    { href: "/docs", label: "Documents", what: "Per-entity document center (drive-style)" },
    { href: "/reports", label: "Reports", what: "Executive P&L per entity, monthly cash flow, top contractors" },
    { href: "/export", label: "CPA export", what: "Per-entity per-year CSV bundles" },
    { href: "/accounts", label: "Accounts", what: "Bluevine / BofA / Axos / AMEX with cardholders" },
    { href: "/properties", label: "Properties", what: "Per-property cards with depreciation + insurance" },
    { href: "/entities", label: "Entities", what: "Six LLCs + personal joint with full drill-downs" },
  ];

  const SCRIPTS = [
    { name: "npm run dev", what: "Local dev on :3000" },
    { name: "npm run build && npm start", what: "Production build" },
    { name: "npm run db:seed", what: "Idempotent seed: users + entities + Bluevine accounts" },
    { name: "npm run seed:deadlines [YEAR]", what: "94 tax deadlines for year + next" },
    { name: "npm run seed:staff", what: "Path to Change staff + avatars" },
    { name: "npm run seed:2025-tax", what: "2025 1099-NEC + W-2 backfill" },
    { name: "npm run backfill:cobbvault [-- --commit]", what: "Sync accounts + transactions from cobbvault Neon" },
    { name: "npm run backfill:decisions [-- --commit]", what: "Sync cobbvault reconciliation decisions" },
    { name: "npm run autotag:contractors [-- --commit]", what: "Pattern-match untagged txns to contractors" },
    { name: "npm run watch:drop", what: "Watch DROP_FOLDER_PATH; classify + ingest statements" },
    { name: "npm run set:password <email> <pass>", what: "Reset a user's password (bcrypt)" },
  ];

  return (
    <Page>
      <PageHeader
        title="Settings & help"
        subtitle={me ? `Signed in as ${me.name} <${me.email}>` : "Not signed in"}
      />

      {missingRequired.length > 0 && (
        <Callout title="Missing required env vars" tone="danger">
          {missingRequired.map((v) => v.name).join(", ")} — set these in
          .env.local or your Vercel project before deploy.
        </Callout>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* LEFT */}
        <div className="space-y-6">
          <section>
            <SectionHeader title="Environment" />
            <Card>
              <ul className="divide-y divide-[var(--border)] text-sm">
                {envStatus.map((v) => (
                  <li
                    key={v.name}
                    className="flex items-baseline justify-between gap-3 px-5 py-3"
                  >
                    <div className="min-w-0">
                      <div className="font-mono text-[13px] font-semibold">
                        {v.name}
                      </div>
                      <div className="text-xs text-[var(--muted)]">{v.purpose}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      {v.required && (
                        <span className="text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">
                          required
                        </span>
                      )}
                      {v.set ? (
                        <StatusPill tone="success">Set</StatusPill>
                      ) : v.required ? (
                        <StatusPill tone="danger">Missing</StatusPill>
                      ) : (
                        <StatusPill tone="neutral">Unset</StatusPill>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          </section>

          <section>
            <SectionHeader title="Database snapshot" />
            <Card>
              <ul className="divide-y divide-[var(--border)] text-sm">
                {counts.map((c) => (
                  <li
                    key={c.label}
                    className="flex items-baseline justify-between gap-3 px-5 py-3"
                  >
                    {c.href ? (
                      <Link
                        href={c.href}
                        className="hover:underline text-[var(--foreground)]"
                      >
                        {c.label}
                      </Link>
                    ) : (
                      <span>{c.label}</span>
                    )}
                    <span className="font-display tabular text-base">
                      {c.value.toLocaleString()}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          </section>

          <section>
            <SectionHeader title="CLI scripts" />
            <Card>
              <ul className="divide-y divide-[var(--border)] text-sm">
                {SCRIPTS.map((s) => (
                  <li key={s.name} className="px-5 py-3">
                    <div className="font-mono text-[13px]">{s.name}</div>
                    <div className="text-xs text-[var(--muted)] mt-0.5">
                      {s.what}
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          </section>

          <section>
            <SectionHeader title="All routes" />
            <Card>
              <ul className="divide-y divide-[var(--border)] text-sm">
                {ROUTES.map((r) => (
                  <li
                    key={r.href}
                    className="flex items-baseline justify-between gap-3 px-5 py-3"
                  >
                    <div className="min-w-0">
                      <Link
                        href={r.href}
                        className="font-medium hover:underline"
                      >
                        {r.label}
                      </Link>
                      <div className="text-xs text-[var(--muted)] mt-0.5">
                        {r.what}
                      </div>
                    </div>
                    <span className="font-mono text-[10px] text-[var(--muted)]">
                      {r.href}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          </section>
        </div>

        {/* RIGHT — account */}
        <aside className="space-y-6 lg:sticky lg:top-24 h-fit">
          <section>
            <SectionHeader title="Change password" />
            <Card className="p-5">
              <ChangePasswordForm />
            </Card>
          </section>

          <section>
            <SectionHeader title="Sign out" />
            <Card className="p-5 space-y-3 text-sm text-[var(--body)]">
              <SignOutEverywhereForm />
              <div className="text-xs text-[var(--muted)] leading-relaxed">
                Sessions are stateless HMAC cookies — to invalidate{" "}
                <em>all</em> outstanding sessions (e.g. lost device), rotate{" "}
                <code className="font-mono">SESSION_SECRET</code> in your env
                and redeploy.
              </div>
            </Card>
          </section>

          <section>
            <SectionHeader title="Keyboard" />
            <Card className="p-5 text-sm text-[var(--body)] space-y-2">
              <KbdRow keys={["⌘", "K"]} what="Global search" />
              <KbdRow keys={["↑", "↓"]} what="Navigate search results" />
              <KbdRow keys={["↵"]} what="Open the active result" />
              <KbdRow keys={["esc"]} what="Close drawers + dialogs" />
            </Card>
          </section>
        </aside>
      </div>
    </Page>
  );
}

function KbdRow({ keys, what }: { keys: string[]; what: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex gap-1">
        {keys.map((k) => (
          <kbd
            key={k}
            className="rounded bg-[var(--surface-warm)] border border-[var(--border)] px-1.5 py-0.5 font-mono text-[10px]"
          >
            {k}
          </kbd>
        ))}
      </div>
      <span className="text-xs text-[var(--muted)]">{what}</span>
    </div>
  );
}
