"use client";

import { useRef, useTransition } from "react";
import { setEntityScope } from "@/lib/scope";

export type EntitySwitcherEntity = { slug: string; name: string };

export function EntitySwitcher({
  active,
  entities: list,
}: {
  active: string;
  entities: EntitySwitcherEntity[];
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [, startTransition] = useTransition();

  return (
    <form ref={formRef} action={setEntityScope} className="flex items-center gap-2">
      <label htmlFor="entity-scope" className="sr-only">
        Entity scope
      </label>
      <div className="relative">
        <select
          id="entity-scope"
          name="slug"
          defaultValue={active}
          onChange={(e) => {
            const fd = new FormData(formRef.current!);
            fd.set("slug", e.currentTarget.value);
            startTransition(() => setEntityScope(fd));
          }}
          className="appearance-none rounded-full border border-[var(--border)] bg-white pl-4 pr-9 py-1.5 text-sm font-medium shadow-sm hover:border-[var(--border-strong)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-1 transition-colors"
        >
          <option value="all">All entities</option>
          {list.map((e) => (
            <option key={e.slug} value={e.slug}>
              {e.name}
            </option>
          ))}
        </select>
        <svg
          aria-hidden
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted)]"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </div>
    </form>
  );
}
