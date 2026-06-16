"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { NavLink, type NavItem } from "./sidebar-nav";

export function MobileNav({
  items,
  bottomItems,
}: {
  items: NavItem[];
  bottomItems?: NavItem[];
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open navigation"
        aria-expanded={open}
        className="lg:hidden grid place-items-center w-10 h-10 -ml-1 rounded-lg text-[var(--body)] hover:bg-[var(--surface-warm)] shrink-0"
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <path d="M3 6h18M3 12h18M3 18h18" />
        </svg>
      </button>

      <div
        onClick={() => setOpen(false)}
        aria-hidden
        className={[
          "lg:hidden fixed inset-0 z-40 bg-[rgba(15,23,42,0.45)] transition-opacity duration-200",
          open ? "opacity-100" : "opacity-0 pointer-events-none",
        ].join(" ")}
      />

      <aside
        className={[
          "lg:hidden fixed inset-y-0 left-0 z-50 w-[280px] max-w-[85vw] bg-white border-r border-[var(--border)] flex flex-col shadow-[var(--shadow-lift)] transition-transform duration-200",
          open ? "translate-x-0 visible" : "-translate-x-full invisible pointer-events-none",
        ].join(" ")}
        aria-label="Primary navigation"
        aria-hidden={!open}
      >
        <div className="px-4 py-4 border-b border-[var(--border)] flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-3 min-w-0">
            <Image
              src="/theledger-assets/logo.png"
              alt="The Ledger"
              width={34}
              height={34}
              priority
              className="rounded-md shrink-0"
            />
            <div className="min-w-0">
              <div
                className="font-display text-lg leading-none truncate"
                style={{ color: "var(--foreground)" }}
              >
                The Ledger
              </div>
              <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--muted)] mt-1">
                Cobb Family Legacy
              </div>
            </div>
          </Link>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close navigation"
            className="grid place-items-center w-9 h-9 rounded-lg text-[var(--muted)] hover:bg-[var(--surface-warm)] shrink-0"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div
          className="flex-1 overflow-y-auto py-3"
          onClick={(e) => {
            if ((e.target as HTMLElement).closest("a")) setOpen(false);
          }}
        >
          <ul className="px-2 space-y-0.5">
            {items.map((it) => (
              <NavLink key={it.href} item={it} expanded pathname={pathname} />
            ))}
          </ul>
          {bottomItems && bottomItems.length > 0 && (
            <ul className="px-2 space-y-0.5 mt-3 pt-3 border-t border-[var(--border)]">
              {bottomItems.map((it) => (
                <NavLink key={it.href} item={it} expanded pathname={pathname} />
              ))}
            </ul>
          )}
        </div>
      </aside>
    </>
  );
}
