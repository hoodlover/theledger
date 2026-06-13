import Link from "next/link";
import Image from "next/image";
import { db } from "@/lib/db";
import { entities } from "@/lib/db/schema";
import { asc } from "drizzle-orm";
import { getActiveScope } from "@/lib/scope";
import { getCurrentUser } from "@/lib/current-user";
import { EntitySwitcher } from "./entity-switcher";
import { SidebarNav, type NavItem } from "./sidebar-nav";

const PRIMARY_NAV: NavItem[] = [
  { href: "/", label: "Dashboard", icon: "dashboard-btn" },
  { href: "/quick-entry", label: "Quick entry", icon: "uploads-btn" },
  { href: "/reconcile", label: "Reconcile", icon: "folder-icon" },
  { href: "/transactions", label: "Transactions", icon: "transactions-btn" },
  { href: "/contractors", label: "1099 contractors", icon: "1099-btn" },
  { href: "/employees", label: "Employees", icon: "W-2-btn" },
  { href: "/transfers", label: "Inter-entity", icon: "bills-btn" },
  { href: "/receipts", label: "Receipts", icon: "receipts-btn" },
  { href: "/imports", label: "Statement imports", icon: "account-stmts-btn" },
  { href: "/deadlines", label: "Tax deadlines", icon: "tax-cal-btn" },
  { href: "/docs", label: "Documents", icon: "docs-btn" },
  { href: "/reports", label: "Reports", icon: "reports-btn" },
];

const SECONDARY_NAV: NavItem[] = [
  { href: "/export", label: "CPA export", icon: "cpa-btn" },
  { href: "/accounts", label: "Accounts", icon: "bank-accounts-btn" },
  { href: "/properties", label: "Properties", icon: "properties-btn" },
  { href: "/entities", label: "Entities", icon: "entities-btn" },
];

export async function AppShell({ children }: { children: React.ReactNode }) {
  const [allEntities, scope, currentUser] = await Promise.all([
    db
      .select({ slug: entities.slug, name: entities.name })
      .from(entities)
      .orderBy(asc(entities.name)),
    getActiveScope(),
    getCurrentUser(),
  ]);

  return (
    <div className="flex min-h-full bg-[var(--background)]">
      <SidebarNav items={PRIMARY_NAV} bottomItems={SECONDARY_NAV} />

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top bar with scope + breadcrumb-ish chip */}
        <header className="sticky top-0 z-20 border-b border-[var(--border)] bg-[color-mix(in_oklab,var(--background)_92%,transparent)] backdrop-blur">
          <div className="mx-auto max-w-[1600px] flex items-center justify-between gap-4 px-6 py-3">
            <div className="flex items-center gap-3 min-w-0">
              {scope.entity ? (
                <span className="inline-flex items-center gap-2 rounded-full bg-[var(--surface-warm)] border border-[var(--border)] px-3 py-1 text-xs text-[var(--body)]">
                  <span
                    aria-hidden
                    className="inline-block w-2 h-2 rounded-full"
                    style={{ background: "var(--accent)" }}
                  />
                  Scoped to <strong className="font-semibold">{scope.entity.name}</strong>
                </span>
              ) : (
                <span className="text-xs text-[var(--muted)]">
                  All entities · use the switcher to scope
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <EntitySwitcher active={scope.slug} entities={allEntities} />
              {currentUser && (
                <div className="hidden sm:flex items-center gap-2 text-xs">
                  <span className="text-[var(--muted)]">{currentUser.name}</span>
                  <a
                    href="/logout"
                    className="text-[var(--muted)] hover:text-[var(--danger)]"
                  >
                    Sign out
                  </a>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1">
          <div className="mx-auto max-w-[1600px] px-6 py-8">{children}</div>
        </main>

        <footer className="border-t border-[var(--border)] px-6 py-5 text-center text-xs text-[var(--muted)]">
          <Image
            src="/theledger-assets/emblem-wider.webp"
            alt="The Ledger — Cobb Family Legacy"
            width={240}
            height={66}
            className="mx-auto opacity-80"
          />
          <div className="mt-2 italic tracking-wide">
            Every Dollar. Every Entity. One View.
          </div>
        </footer>
      </div>
    </div>
  );
}
