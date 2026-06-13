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
      <select
        id="entity-scope"
        name="slug"
        defaultValue={active}
        onChange={(e) => {
          const fd = new FormData(formRef.current!);
          fd.set("slug", e.currentTarget.value);
          startTransition(() => setEntityScope(fd));
        }}
        className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm font-medium shadow-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
      >
        <option value="all">All entities</option>
        {list.map((e) => (
          <option key={e.slug} value={e.slug}>
            {e.name}
          </option>
        ))}
      </select>
    </form>
  );
}
