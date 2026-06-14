"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { SearchHit } from "@/app/api/search/route";
import { formatMoney } from "@/components/ui";

const TYPE_LABEL: Record<SearchHit["type"], string> = {
  entity: "Entity",
  contractor: "Contractor",
  employee: "Employee",
  account: "Account",
  transaction: "Transaction",
  receipt: "Receipt",
  deadline: "Deadline",
  client: "Client",
  task: "Task",
};

const TYPE_TONE: Record<SearchHit["type"], string> = {
  entity: "bg-[var(--color-sage-tint,#e8efe9)] text-[var(--accent)]",
  contractor: "bg-[#fbf6ea] text-[#9c6f1a]",
  employee: "bg-[var(--color-sage-tint,#e8efe9)] text-[var(--accent)]",
  account: "bg-[var(--surface-warm)] text-[var(--body)]",
  transaction: "bg-[var(--surface-warm)] text-[var(--body)]",
  receipt: "bg-[var(--surface-warm)] text-[var(--body)]",
  deadline: "bg-[#fbf6ea] text-[#9c6f1a]",
  client: "bg-[var(--color-sage-tint,#e8efe9)] text-[var(--accent)]",
  task: "bg-[#fbf6ea] text-[#9c6f1a]",
};

export function CommandSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<number | null>(null);

  // Global ⌘K / Ctrl+K trigger
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape" && open) {
        e.preventDefault();
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Focus input when modal opens
  useEffect(() => {
    if (open) {
      // microtask so element is in the DOM
      setTimeout(() => inputRef.current?.focus(), 0);
    } else {
      setQ("");
      setHits([]);
      setActive(0);
    }
  }, [open]);

  // Debounced search
  useEffect(() => {
    if (!open) return;
    if (debounceRef.current != null) {
      window.clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    if (q.trim().length < 2) {
      setHits([]);
      setBusy(false);
      return;
    }
    setBusy(true);
    debounceRef.current = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
          cache: "no-store",
        });
        if (!res.ok) {
          setHits([]);
          return;
        }
        const j = (await res.json()) as { hits: SearchHit[] };
        setHits(j.hits);
        setActive(0);
      } catch {
        setHits([]);
      } finally {
        setBusy(false);
      }
    }, 160);
  }, [q, open]);

  const go = useCallback(
    (hit: SearchHit) => {
      setOpen(false);
      router.push(hit.href);
    },
    [router]
  );

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, hits.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const hit = hits[active];
      if (hit) go(hit);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Search (⌘K)"
        className="hidden sm:flex items-center gap-2 rounded-full border border-[var(--border)] bg-white pl-3 pr-2 py-1.5 text-xs text-[var(--muted)] hover:border-[var(--border-strong)] transition-colors"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <span>Search</span>
        <kbd className="ml-2 hidden md:inline-flex items-center gap-0.5 rounded bg-[var(--surface-warm)] px-1.5 py-0.5 text-[10px] font-mono">
          <span>⌘</span>
          <span>K</span>
        </kbd>
      </button>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-[#0f172a]/40 backdrop-blur-sm flex items-start justify-center pt-[10vh] px-4"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-2xl rounded-2xl border border-[var(--border)] bg-white shadow-[0_24px_64px_rgba(15,23,42,0.20)] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-5 py-4 border-b border-[var(--border)]">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-[var(--muted)]"
            aria-hidden
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.currentTarget.value)}
            onKeyDown={onKeyDown}
            placeholder="Search entities, contractors, employees, txns, amounts…"
            className="flex-1 bg-transparent outline-none text-base placeholder:text-[var(--muted)]"
          />
          {busy && (
            <span className="text-xs text-[var(--muted)] tabular">…</span>
          )}
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded bg-[var(--surface-warm)] px-1.5 py-0.5 text-[10px] font-mono text-[var(--muted)]"
            aria-label="Close"
          >
            esc
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto">
          {q.trim().length < 2 ? (
            <div className="px-5 py-8 text-sm text-[var(--muted)] space-y-2">
              <div>Start typing to search.</div>
              <div className="text-xs">
                Try: <kbd className="bg-[var(--surface-warm)] px-1.5 py-0.5 rounded font-mono">Garrett</kbd>{" "}
                · <kbd className="bg-[var(--surface-warm)] px-1.5 py-0.5 rounded font-mono">Bojangles</kbd>{" "}
                · <kbd className="bg-[var(--surface-warm)] px-1.5 py-0.5 rounded font-mono">1730</kbd>{" "}
                · <kbd className="bg-[var(--surface-warm)] px-1.5 py-0.5 rounded font-mono">$2,300</kbd>{" "}
                · <kbd className="bg-[var(--surface-warm)] px-1.5 py-0.5 rounded font-mono">PTC</kbd>
              </div>
            </div>
          ) : hits.length === 0 ? (
            <div className="px-5 py-8 text-sm text-[var(--muted)]">
              {busy ? "Searching…" : `No matches for "${q}"`}
            </div>
          ) : (
            <ul>
              {hits.map((h, i) => {
                const isActive = i === active;
                return (
                  <li key={`${h.type}-${h.id}`}>
                    <button
                      type="button"
                      onMouseEnter={() => setActive(i)}
                      onClick={() => go(h)}
                      className={[
                        "w-full text-left flex items-center gap-3 px-5 py-3 border-l-2 transition-colors",
                        isActive
                          ? "border-[var(--accent)] bg-[var(--surface-warm)]"
                          : "border-transparent hover:bg-[var(--surface-warm)]",
                      ].join(" ")}
                    >
                      <span
                        className={`inline-flex shrink-0 items-center justify-center w-[78px] rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.10em] ${TYPE_TONE[h.type]}`}
                      >
                        {TYPE_LABEL[h.type]}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block font-medium text-[var(--foreground)] truncate">
                          {h.label}
                        </span>
                        {h.secondary && (
                          <span className="block text-xs text-[var(--muted)] truncate">
                            {h.secondary}
                          </span>
                        )}
                      </span>
                      {h.amount != null && (
                        <span className="font-semibold tabular text-sm">
                          {formatMoney(h.amount)}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="px-5 py-2.5 border-t border-[var(--border)] flex items-center justify-between text-[10px] text-[var(--muted)] bg-[var(--surface-warm)]">
          <span className="flex items-center gap-3">
            <span>
              <kbd className="bg-white border border-[var(--border)] px-1 rounded font-mono">↑↓</kbd>{" "}
              navigate
            </span>
            <span>
              <kbd className="bg-white border border-[var(--border)] px-1 rounded font-mono">↵</kbd>{" "}
              open
            </span>
            <span>
              <kbd className="bg-white border border-[var(--border)] px-1 rounded font-mono">esc</kbd>{" "}
              close
            </span>
          </span>
          {hits.length > 0 && (
            <span>{hits.length} result{hits.length === 1 ? "" : "s"}</span>
          )}
        </div>
      </div>
    </div>
  );
}
