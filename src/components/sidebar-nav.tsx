"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";

export type NavItem = {
  href: string;
  label: string;
  icon: string; // filename in /public/ledger-icons/ without extension
};

export function SidebarNav({
  items,
  bottomItems,
}: {
  items: NavItem[];
  bottomItems?: NavItem[];
}) {
  const pathname = usePathname();
  const [expanded, setExpanded] = useState<boolean>(true);

  // Restore persisted collapse state
  useEffect(() => {
    const stored = typeof window !== "undefined" ? localStorage.getItem("tl_nav_expanded") : null;
    if (stored == null) return;
    const frame = window.requestAnimationFrame(() => setExpanded(stored === "1"));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  function toggle() {
    const next = !expanded;
    setExpanded(next);
    try {
      localStorage.setItem("tl_nav_expanded", next ? "1" : "0");
    } catch {}
  }

  return (
    <aside
      className={[
        "hidden lg:flex sticky top-0 h-screen shrink-0 bg-white border-r border-[var(--border)] flex-col transition-[width] duration-200",
        expanded ? "w-[260px]" : "w-[80px]",
      ].join(" ")}
      aria-label="Primary navigation"
    >
      {/* Brand header */}
      <div className="px-4 py-5 border-b border-[var(--border)] flex items-center gap-3">
        <Link href="/" className="flex items-center gap-3 min-w-0">
          <Image
            src="/theledger-assets/logo.png"
            alt="The Ledger"
            width={36}
            height={36}
            priority
            className="rounded-md shrink-0"
          />
          {expanded && (
            <div className="min-w-0">
              <div
                className="font-display text-lg leading-none truncate"
                style={{ color: "var(--foreground)" }}
              >
                The Ledger
              </div>
              <div
                className="text-[10px] uppercase tracking-[0.16em] text-[var(--muted)] mt-1"
              >
                Cobb Family Legacy
              </div>
            </div>
          )}
        </Link>
      </div>

      {/* Items */}
      <div className="flex-1 overflow-y-auto py-3">
        <ul className="px-2 space-y-0.5">
          {items.map((it) => (
            <NavLink key={it.href} item={it} expanded={expanded} pathname={pathname} />
          ))}
        </ul>
      </div>

      {bottomItems && bottomItems.length > 0 && (
        <div className="border-t border-[var(--border)] py-3">
          <ul className="px-2 space-y-0.5">
            {bottomItems.map((it) => (
              <NavLink key={it.href} item={it} expanded={expanded} pathname={pathname} />
            ))}
          </ul>
        </div>
      )}

      {/* Collapse toggle */}
      <button
        type="button"
        onClick={toggle}
        aria-label={expanded ? "Collapse navigation" : "Expand navigation"}
        className="border-t border-[var(--border)] px-4 py-3 text-xs text-[var(--muted)] hover:bg-[var(--surface-warm)] flex items-center gap-2"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={expanded ? "" : "rotate-180"}
        >
          <path d="m15 18-6-6 6-6" />
        </svg>
        {expanded && <span>Collapse</span>}
      </button>
    </aside>
  );
}

export function NavLink({
  item,
  expanded,
  pathname,
}: {
  item: NavItem;
  expanded: boolean;
  pathname: string;
}) {
  const active =
    pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
  return (
    <li>
      <Link
        href={item.href}
        title={item.label}
        className={[
          "relative group flex items-center gap-3 rounded-lg px-2 py-2 text-sm font-medium transition-colors",
          active
            ? "bg-[var(--color-sage-tint,#e8efe9)] text-[var(--foreground)]"
            : "text-[var(--body)] hover:bg-[var(--surface-warm)]",
        ].join(" ")}
      >
        {/* Active accent bar */}
        {active && (
          <span
            aria-hidden
            className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r"
            style={{ background: "var(--accent)" }}
          />
        )}
        <span className="shrink-0 grid place-items-center w-9 h-9">
          <Image
            src={`/ledger-icons/${item.icon}.png`}
            alt=""
            width={32}
            height={32}
            className="rounded-full"
          />
        </span>
        {expanded && (
          <span className="truncate">{item.label}</span>
        )}
      </Link>
    </li>
  );
}
