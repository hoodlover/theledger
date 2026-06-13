import Link from "next/link";
import { db } from "@/lib/db";
import { entities } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

const KIND_LABEL: Record<string, string> = {
  s_corp: "S-corp",
  llc: "LLC",
  sole_prop: "Sole prop",
  individual: "Individual",
};

export default async function EntitiesPage() {
  const rows = await db.select().from(entities).orderBy(entities.name);

  return (
    <main className="mx-auto max-w-4xl px-6 py-12 font-sans">
      <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-900">
        &larr; Home
      </Link>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">Entities</h1>
      <p className="mt-2 text-zinc-600">
        {rows.length} entit{rows.length === 1 ? "y" : "ies"} seeded from Neon.
      </p>

      <ul className="mt-8 divide-y divide-zinc-200 rounded-lg border border-zinc-200">
        {rows.map((e) => (
          <li key={e.id} className="px-4 py-3">
            <div className="flex items-baseline justify-between gap-4">
              <div className="font-medium">{e.name}</div>
              <div className="text-xs uppercase tracking-wide text-zinc-500">
                {KIND_LABEL[e.kind] ?? e.kind}
                {e.state ? ` · ${e.state}` : ""}
              </div>
            </div>
            {e.propertyAddress && (
              <div className="mt-1 text-sm text-zinc-600">
                {e.propertyAddress}
                {e.rentalClassification && e.rentalClassification !== "n_a"
                  ? ` · ${e.rentalClassification.toUpperCase()}`
                  : ""}
              </div>
            )}
            {e.notes && (
              <div className="mt-1 text-sm text-zinc-500">{e.notes}</div>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
