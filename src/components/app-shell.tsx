import Link from "next/link";
import Image from "next/image";
import { db } from "@/lib/db";
import { entities, practiceNotifications } from "@/lib/db/schema";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { getActiveScope } from "@/lib/scope";
import { getCurrentUser } from "@/lib/current-user";
import { EntitySwitcher } from "./entity-switcher";
import { SidebarNav, type NavItem } from "./sidebar-nav";
import { CommandSearch } from "./cmdk-search";
import { NotificationBell, type BellItem } from "./notification-bell";
import { QuickLogFab } from "./quick-log-fab";

const PRIMARY_NAV: NavItem[] = [
  { href: "/", label: "Dashboard", icon: "dashboard" },
  { href: "/practice", label: "Practice", icon: "1099_contractors" },
  { href: "/practice/board", label: "Board", icon: "reconcile" },
  { href: "/practice/tasks", label: "Tasks", icon: "tax_deadlines" },
  { href: "/practice/calendar", label: "Calendar", icon: "mileage" },
  { href: "/quick-entry", label: "Quick entry", icon: "quick_entry" },
  { href: "/reconcile", label: "Reconcile", icon: "reconcile" },
  { href: "/mileage", label: "Mileage", icon: "mileage" },
  { href: "/transactions", label: "Transactions", icon: "transactions" },
  { href: "/contractors", label: "1099 contractors", icon: "1099_contractors" },
  { href: "/employees", label: "Employees", icon: "w_2_employees" },
  { href: "/transfers", label: "Inter-entity", icon: "transfers" },
  { href: "/receipts", label: "Receipts", icon: "receipts" },
  { href: "/imports", label: "Statement imports", icon: "statements" },
  { href: "/deadlines", label: "Tax deadlines", icon: "tax_deadlines" },
  { href: "/docs", label: "Documents", icon: "docs" },
  { href: "/reports", label: "Reports", icon: "reports" },
];

const SECONDARY_NAV: NavItem[] = [
  { href: "/export", label: "CPA export", icon: "export" },
  { href: "/accounts", label: "Accounts", icon: "accounts" },
  { href: "/properties", label: "Properties", icon: "properties" },
  { href: "/entities", label: "Entities", icon: "ledger" },
  { href: "/audit", label: "Activity", icon: "activity" },
  { href: "/settings", label: "Settings", icon: "settings" },
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

  // Pull the 15 most recent notifications + unread count for the bell.
  let bellItems: BellItem[] = [];
  let unreadCount = 0;
  if (currentUser) {
    const [items, unread] = await Promise.all([
      db
        .select({
          id: practiceNotifications.id,
          kind: practiceNotifications.kind,
          summary: practiceNotifications.summary,
          refKind: practiceNotifications.refKind,
          refId: practiceNotifications.refId,
          createdAt: practiceNotifications.createdAt,
        })
        .from(practiceNotifications)
        .where(eq(practiceNotifications.recipientUserId, currentUser.id))
        .orderBy(desc(practiceNotifications.createdAt))
        .limit(15),
      db
        .select({ id: practiceNotifications.id })
        .from(practiceNotifications)
        .where(
          and(
            eq(practiceNotifications.recipientUserId, currentUser.id),
            isNull(practiceNotifications.readAt)
          )
        ),
    ]);
    bellItems = items.map((i) => ({
      id: i.id,
      kind: i.kind,
      summary: i.summary,
      refKind: i.refKind,
      refId: i.refId,
      createdAt: i.createdAt.toISOString(),
    }));
    unreadCount = unread.length;
  }

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
              <CommandSearch />
              {currentUser && (
                <NotificationBell
                  initialUnread={unreadCount}
                  initialItems={bellItems}
                />
              )}
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
      <QuickLogFab />
    </div>
  );
}
