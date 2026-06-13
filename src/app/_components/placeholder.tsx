import Link from "next/link";

export function Placeholder({
  title,
  description,
  checklist,
}: {
  title: string;
  description: string;
  checklist: string[];
}) {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12 font-sans">
      <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-900">
        &larr; Home
      </Link>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 text-zinc-600">{description}</p>
      <h2 className="mt-8 text-sm font-medium uppercase tracking-wide text-zinc-500">
        v0 checklist
      </h2>
      <ul className="mt-3 space-y-2 text-sm">
        {checklist.map((c) => (
          <li key={c} className="flex gap-2">
            <span className="text-zinc-400">&#9633;</span>
            <span>{c}</span>
          </li>
        ))}
      </ul>
    </main>
  );
}
