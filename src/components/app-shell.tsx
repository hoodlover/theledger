import Link from "next/link";
import { db } from "@/lib/db";
import { entities } from "@/lib/db/schema";
import { asc } from "drizzle-orm";
import { getActiveScope } from "@/lib/scope";
import { EntitySwitcher } from "./entity-switcher";
import { NavPill } from "./nav-pill";

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/quick-entry", label: "Quick entry" },
  { href: "/transactions", label: "Transactions" },
  { href: "/contractors", label: "1099s" },
  { href: "/employees", label: "Employees" },
  { href: "/transfers", label: "Transfers" },
  { href: "/receipts", label: "Receipts" },
  { href: "/imports", label: "Imports" },
  { href: "/export", label: "CPA export" },
  { href: "/accounts", label: "Accounts" },
  { href: "/entities", label: "Entities" },
];

export async function AppShell({ children }: { children: React.ReactNode }) {
  const [allEntities, scope] = await Promise.all([
    db
      .select({ slug: entities.slug, name: entities.name })
      .from(entities)
      .orderBy(asc(entities.name)),
    getActiveScope(),
  ]);

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-20 border-b border-[var(--border)] bg-[color-mix(in_oklab,var(--background)_85%,transparent)] backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link href="/" className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-[var(--foreground)] text-[var(--background)] text-xs font-bold">
              TL
            </span>
            <span className="text-sm font-semibold tracking-tight">
              The Ledger
            </span>
          </Link>
          <EntitySwitcher active={scope.slug} entities={allEntities} />
        </div>
        <nav className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 pb-3 sm:px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {NAV.map((n) => (
            <NavPill key={n.href} href={n.href} label={n.label} />
          ))}
        </nav>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-[var(--border)] px-4 py-4 text-center text-xs text-[var(--muted)] sm:px-6">
        The Ledger · v0 ·{" "}
        {scope.entity ? (
          <span>
            Scoped to <strong>{scope.entity.name}</strong>
          </span>
        ) : (
          <span>All entities</span>
        )}
      </footer>
    </div>
  );
}
