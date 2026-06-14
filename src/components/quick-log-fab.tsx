"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

// Phone-friendly entry point for /practice + /practice/tasks + /practice/board.
// Appears bottom-right with safe-area inset support for iOS PWA.
// Opens a small action menu — "Log inquiry" / "Log session" / "New task" links
// straight into the existing pages (the modal triggers live there).
export function QuickLogFab() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Only show on practice routes. Don't render on form-heavy detail pages.
  const showOn =
    pathname === "/practice" ||
    pathname === "/practice/board" ||
    pathname === "/practice/tasks" ||
    pathname === "/practice/calendar";
  if (!showOn) return null;

  useEffect(() => {
    if (!open) return;
    function close(e: MouseEvent) {
      const t = e.target as HTMLElement;
      if (!t.closest?.("[data-fab-root]")) setOpen(false);
    }
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [open]);

  return (
    <div
      data-fab-root
      className="fixed right-4 z-30 sm:hidden"
      style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)" }}
    >
      {open && (
        <div className="mb-2 flex flex-col items-end gap-2">
          <Link
            href="/practice?openLog=inquiry"
            onClick={() => setOpen(false)}
            className="rounded-full bg-white border border-[var(--border)] shadow-[0_8px_20px_rgba(15,23,42,0.16)] px-4 py-2 text-sm font-semibold text-[var(--accent)]"
          >
            Log inquiry
          </Link>
          <Link
            href="/practice?openLog=session"
            onClick={() => setOpen(false)}
            className="rounded-full bg-white border border-[var(--border)] shadow-[0_8px_20px_rgba(15,23,42,0.16)] px-4 py-2 text-sm font-semibold"
          >
            Log session
          </Link>
          <Link
            href="/practice/tasks"
            onClick={() => setOpen(false)}
            className="rounded-full bg-white border border-[var(--border)] shadow-[0_8px_20px_rgba(15,23,42,0.16)] px-4 py-2 text-sm font-semibold"
          >
            Open tasks
          </Link>
          <Link
            href="/practice/board"
            onClick={() => setOpen(false)}
            className="rounded-full bg-white border border-[var(--border)] shadow-[0_8px_20px_rgba(15,23,42,0.16)] px-4 py-2 text-sm font-semibold"
          >
            Open board
          </Link>
        </div>
      )}
      <button
        type="button"
        aria-label={open ? "Close quick log" : "Open quick log"}
        onClick={() => setOpen((o) => !o)}
        className={[
          "w-14 h-14 rounded-full grid place-items-center text-white text-2xl font-bold shadow-[0_12px_28px_rgba(15,23,42,0.30)] transition-transform",
          open
            ? "bg-[var(--foreground)] rotate-45"
            : "bg-[var(--accent)] hover:scale-105",
        ].join(" ")}
      >
        +
      </button>
    </div>
  );
}
