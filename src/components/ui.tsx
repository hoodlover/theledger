import Link from "next/link";
import type { ReactNode } from "react";

// ───────── Layout primitives ─────────

export function Page({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10">{children}</div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && (
          <p className="mt-1 text-sm text-[var(--muted)]">{subtitle}</p>
        )}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={
        "rounded-xl border border-[var(--border)] bg-[var(--surface)] " +
        className
      }
    >
      {children}
    </div>
  );
}

export function CardHeader({ children }: { children: ReactNode }) {
  return (
    <div className="border-b border-[var(--border)] px-4 py-3 text-sm font-medium">
      {children}
    </div>
  );
}

export function CardBody({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={"px-4 py-4 " + className}>{children}</div>;
}

// ───────── Tiles ─────────

export function StatTile({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger";
}) {
  const toneClass =
    tone === "success"
      ? "text-success"
      : tone === "warning"
        ? "text-warning"
        : tone === "danger"
          ? "text-danger"
          : "";
  return (
    <Card className="px-4 py-4">
      <div className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
        {label}
      </div>
      <div className={`mt-2 text-2xl font-semibold tabular ${toneClass}`}>
        {value}
      </div>
      {hint && (
        <div className="mt-1 text-xs text-[var(--muted)]">{hint}</div>
      )}
    </Card>
  );
}

// ───────── Pills + tags ─────────

const PILL_TONE: Record<string, string> = {
  neutral: "bg-[var(--surface)] text-[var(--muted)] border-[var(--border)]",
  success: "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900",
  warning: "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900",
  danger: "bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900",
  accent: "bg-indigo-50 text-indigo-800 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-900",
};

export function StatusPill({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: keyof typeof PILL_TONE;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${PILL_TONE[tone]}`}
    >
      {children}
    </span>
  );
}

export function Tag({ children }: { children: ReactNode }) {
  return (
    <span className="rounded bg-[var(--surface)] px-1.5 py-0.5 text-xs text-[var(--muted)]">
      {children}
    </span>
  );
}

// ───────── Empty state + callouts ─────────

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <Card className="px-6 py-12 text-center">
      <div className="text-sm font-medium">{title}</div>
      {description && (
        <div className="mx-auto mt-2 max-w-sm text-sm text-[var(--muted)]">
          {description}
        </div>
      )}
      {action && <div className="mt-4">{action}</div>}
    </Card>
  );
}

export function Callout({
  title,
  tone = "neutral",
  children,
}: {
  title?: ReactNode;
  tone?: "neutral" | "warning" | "info";
  children: ReactNode;
}) {
  const ring =
    tone === "warning"
      ? "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200"
      : tone === "info"
        ? "border-indigo-200 bg-indigo-50 text-indigo-900 dark:border-indigo-900 dark:bg-indigo-950/30 dark:text-indigo-200"
        : "border-[var(--border)] bg-[var(--surface)]";
  return (
    <div className={`rounded-md border p-4 text-sm ${ring}`}>
      {title && <div className="font-medium">{title}</div>}
      <div className={title ? "mt-1" : ""}>{children}</div>
    </div>
  );
}

// ───────── Money ─────────

const moneyFmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

export function formatMoney(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return moneyFmt.format(cents / 100);
}

export function Money({
  cents,
  signed = false,
  zero = "—",
}: {
  cents: number | null | undefined;
  signed?: boolean;
  zero?: string;
}) {
  if (cents == null) return <span className="text-[var(--muted)]">{zero}</span>;
  const tone =
    signed && cents < 0
      ? "text-danger"
      : signed && cents > 0
        ? "text-success"
        : "";
  return <span className={`tabular ${tone}`}>{formatMoney(cents)}</span>;
}

// ───────── Buttons ─────────

export function Avatar({
  src,
  name,
  size = 32,
}: {
  src: string | null | undefined;
  name: string;
  size?: number;
}) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name}
        loading="lazy"
        width={size}
        height={size}
        style={{ width: size, height: size }}
        className="rounded-full object-cover bg-[var(--surface)] border border-[var(--border)]"
      />
    );
  }
  return (
    <div
      style={{ width: size, height: size, fontSize: size * 0.4 }}
      className="grid place-items-center rounded-full bg-[var(--surface)] border border-[var(--border)] text-[var(--muted)] font-semibold"
      aria-hidden
    >
      {initials || "?"}
    </div>
  );
}

export function ButtonLink({
  href,
  children,
  variant = "primary",
}: {
  href: string;
  children: ReactNode;
  variant?: "primary" | "ghost";
}) {
  const base =
    "inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors";
  const variantClass =
    variant === "primary"
      ? "bg-[var(--foreground)] text-[var(--background)] hover:opacity-90"
      : "border border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--surface)]";
  return (
    <Link href={href} className={`${base} ${variantClass}`}>
      {children}
    </Link>
  );
}
