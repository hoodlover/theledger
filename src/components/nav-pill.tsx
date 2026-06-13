"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavPill({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  const active = pathname === href || (href !== "/" && pathname.startsWith(href));
  return (
    <Link
      href={href}
      className={[
        "rounded-full px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors",
        active
          ? "bg-[var(--foreground)] text-[var(--background)]"
          : "text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--foreground)]",
      ].join(" ")}
    >
      {label}
    </Link>
  );
}
