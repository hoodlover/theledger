"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { markNotificationsRead } from "@/app/(app)/practice/_crm-actions";

export type BellItem = {
  id: string;
  kind: string;
  summary: string;
  refKind: string | null;
  refId: string | null;
  createdAt: string;
};

function refHref(refKind: string | null, refId: string | null): string | null {
  if (!refKind || !refId) return null;
  switch (refKind) {
    case "practice_client":
      return `/practice/clients/${refId}`;
    case "practice_task":
      return `/practice/tasks`;
    case "practice_session":
      return `/practice`;
    default:
      return null;
  }
}

export function NotificationBell({
  initialUnread,
  initialItems,
}: {
  initialUnread: number;
  initialItems: BellItem[];
}) {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(initialUnread);
  const [items, setItems] = useState(initialItems);
  const [, startTransition] = useTransition();
  const router = useRouter();

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (!target.closest?.("[data-bell-root]")) {
        setOpen(false);
      }
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [open]);

  async function markAllRead() {
    startTransition(async () => {
      const res = await markNotificationsRead();
      if (res.updated > 0) {
        setUnread(0);
        setItems((cur) => cur.map((x) => ({ ...x })));
        router.refresh();
      }
    });
  }

  return (
    <div data-bell-root className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Notifications"
        className="relative inline-flex items-center justify-center h-8 w-8 rounded-full hover:bg-[var(--surface-warm)] text-[var(--body)]"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10 21a2 2 0 0 0 4 0" />
        </svg>
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 rounded-full bg-[var(--danger)] text-white text-[10px] font-semibold grid place-items-center px-1">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-10 z-30 w-[360px] rounded-2xl border border-[var(--border)] bg-white shadow-[0_24px_60px_rgba(15,23,42,0.18)] p-3">
          <div className="flex items-baseline justify-between mb-2 px-1">
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
              Notifications
            </span>
            {unread > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                className="text-[11px] text-[var(--accent)] hover:underline"
              >
                Mark all read
              </button>
            )}
          </div>
          {items.length === 0 ? (
            <p className="text-xs text-[var(--muted)] italic px-2 py-3">
              No notifications.
            </p>
          ) : (
            <ul className="max-h-[400px] overflow-y-auto divide-y divide-[var(--border)]">
              {items.map((n) => {
                const href = refHref(n.refKind, n.refId);
                const Item = (
                  <div className="px-2 py-2 hover:bg-[var(--surface-warm)] rounded-md">
                    <div className="text-sm">{n.summary}</div>
                    <div className="text-[10px] text-[var(--muted)] tabular mt-1">
                      {new Date(n.createdAt)
                        .toISOString()
                        .slice(0, 16)
                        .replace("T", " ")}{" "}
                      · {n.kind}
                    </div>
                  </div>
                );
                return (
                  <li key={n.id}>
                    {href ? (
                      <Link
                        href={href}
                        onClick={() => setOpen(false)}
                        className="block"
                      >
                        {Item}
                      </Link>
                    ) : (
                      Item
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
