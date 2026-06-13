import Image from "next/image";
import { login } from "./_action";

const ERRORS: Record<string, string> = {
  missing: "Email and password required.",
  bad: "Email or password incorrect.",
};

type SP = Promise<{ error?: string; next?: string }>;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: SP;
}) {
  const sp = await searchParams;
  const err = sp.error ? ERRORS[sp.error] ?? null : null;

  return (
    <div className="min-h-screen grid lg:grid-cols-[1.05fr_0.95fr] bg-[var(--background)]">
      {/* Branding panel */}
      <div className="relative hidden lg:block bg-[var(--surface-warm)] overflow-hidden">
        <Image
          src="/theledger-assets/emblem-wider.png"
          alt="The Ledger — Cobb Family Legacy"
          width={520}
          height={144}
          priority
          className="absolute top-12 left-12 right-12 max-w-[520px]"
        />
        <Image
          src="/theledger-assets/family.jpg"
          alt=""
          fill
          className="object-cover object-center opacity-90"
          sizes="50vw"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0f172a]/55 via-transparent to-[var(--surface-warm)]/60" />
        <div className="absolute bottom-12 left-12 right-12 text-white">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#c89d4a] mb-3">
            Cobb Family Legacy
          </div>
          <div className="font-display text-3xl leading-tight">
            Six Entities. One Ledger.
          </div>
          <p className="mt-3 text-sm text-white/85 max-w-md italic">
            Every Dollar. Every Entity. One View.
          </p>
        </div>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center p-8 sm:p-12">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <Image
              src="/theledger-assets/logo.png"
              alt="The Ledger"
              width={44}
              height={44}
              className="rounded-md"
              priority
            />
            <div>
              <div className="font-display text-xl">The Ledger</div>
              <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--muted)] mt-1">
                Cobb Family Legacy
              </div>
            </div>
          </div>

          <h1 className="font-display text-3xl tracking-tight">Welcome back.</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Sign in with your family-office credentials.
          </p>

          {err && (
            <div className="mt-5 rounded-md border border-[#ebcacb] bg-[#f5e8e9] p-3 text-sm text-[var(--danger)]">
              {err}
            </div>
          )}

          <form action={login} className="mt-7 space-y-4">
            <input type="hidden" name="next" value={sp.next ?? "/"} />
            <Field label="Email">
              <input
                type="email"
                name="email"
                required
                autoComplete="email"
                autoFocus
                className={inputClasses}
                placeholder="you@example.com"
              />
            </Field>
            <Field label="Password">
              <input
                type="password"
                name="password"
                required
                autoComplete="current-password"
                className={inputClasses}
              />
            </Field>
            <button
              type="submit"
              className="w-full rounded-full bg-[var(--foreground)] py-3 text-base font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(15,23,42,0.20)]"
            >
              Sign in
            </button>
            <p className="text-xs text-[var(--muted)] text-center mt-2">
              Two seats: Lance + Heather. Set or reset a password from the CLI:
              <br />
              <code className="text-[10px] tabular">
                npm run set:password &lt;email&gt; &lt;new-password&gt;
              </code>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}

const inputClasses =
  "w-full rounded-lg border border-[var(--border)] bg-[var(--surface-warm)] px-3 py-2.5 text-base focus:bg-white focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20 transition-colors";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
        {label}
      </span>
      {children}
    </label>
  );
}
