import Link from "next/link";
import type { ReactNode } from "react";

// ───────── Layout primitives ─────────

export function Page({ children }: { children: ReactNode }) {
  return <div className="space-y-8">{children}</div>;
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
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-3xl tracking-tight">{title}</h1>
        {subtitle && (
          <p className="mt-2 text-sm text-[var(--muted)] max-w-2xl">
            {subtitle}
          </p>
        )}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}

export function Card({
  children,
  className = "",
  tone = "white",
}: {
  children: ReactNode;
  className?: string;
  tone?: "white" | "warm" | "gold" | "navy";
}) {
  const toneClass =
    tone === "warm"
      ? "bg-[var(--surface-warm)]"
      : tone === "gold"
        ? "bg-[#fbf6ea] border-[#e6cf95]"
        : tone === "navy"
          ? "bg-[var(--foreground)] text-white"
          : "bg-[var(--surface)]";
  return (
    <div
      className={[
        "rounded-2xl border border-[var(--border)] shadow-[0_8px_24px_rgba(15,23,42,0.06)]",
        toneClass,
        className,
      ].join(" ")}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children }: { children: ReactNode }) {
  return (
    <div className="border-b border-[var(--border)] px-5 py-4 text-sm font-semibold">
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
  return <div className={"px-5 py-4 " + className}>{children}</div>;
}

// ───────── Tiles ─────────

export function StatTile({
  label,
  value,
  hint,
  tone = "neutral",
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger" | "gold";
  icon?: ReactNode;
}) {
  const accentClass =
    tone === "success"
      ? "text-[var(--color-sage,#5e7d66)]"
      : tone === "warning"
        ? "text-[var(--color-gold,#c89d4a)]"
        : tone === "danger"
          ? "text-[var(--danger)]"
          : tone === "gold"
            ? "text-[var(--gold)]"
            : "";

  return (
    <Card className="px-5 py-5">
      <div className="flex items-start justify-between gap-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
          {label}
        </div>
        {icon && <div className="text-[var(--muted)]">{icon}</div>}
      </div>
      <div
        className={`mt-3 font-display text-3xl tabular leading-none ${accentClass}`}
      >
        {value}
      </div>
      {hint && (
        <div className="mt-2 text-xs text-[var(--muted)]">{hint}</div>
      )}
    </Card>
  );
}

// ───────── Pills + tags ─────────

const PILL_TONE: Record<string, string> = {
  neutral: "bg-[var(--surface-warm)] text-[var(--body)] border-[var(--border)]",
  success:
    "bg-[var(--color-sage-tint,#e8efe9)] text-[var(--accent)] border-transparent",
  warning:
    "bg-[#fbf6ea] text-[#9c6f1a] border-[#ecdcb1]",
  danger: "bg-[#f5e8e9] text-[var(--danger)] border-[#ebcacb]",
  accent:
    "bg-[var(--color-sage-tint,#e8efe9)] text-[var(--accent)] border-transparent",
  gold: "bg-[#fbf6ea] text-[#9c6f1a] border-[#ecdcb1]",
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
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${PILL_TONE[tone]}`}
    >
      {children}
    </span>
  );
}

export function Tag({ children }: { children: ReactNode }) {
  return (
    <span className="rounded bg-[var(--surface-warm)] px-1.5 py-0.5 text-xs text-[var(--muted)]">
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
    <Card className="px-8 py-14 text-center">
      <div className="font-display text-xl">{title}</div>
      {description && (
        <div className="mx-auto mt-2 max-w-md text-sm text-[var(--muted)]">
          {description}
        </div>
      )}
      {action && <div className="mt-5">{action}</div>}
    </Card>
  );
}

export function Callout({
  title,
  tone = "neutral",
  children,
}: {
  title?: ReactNode;
  tone?: "neutral" | "warning" | "info" | "danger";
  children: ReactNode;
}) {
  const ring =
    tone === "warning"
      ? "border-[#ecdcb1] bg-[#fbf6ea] text-[#7a5712]"
      : tone === "info"
        ? "border-[var(--color-sage-tint,#e8efe9)] bg-[#f3f6f3] text-[var(--accent-hover)]"
        : tone === "danger"
          ? "border-[#ebcacb] bg-[#f5e8e9] text-[var(--danger)]"
          : "border-[var(--border)] bg-[var(--surface)]";
  return (
    <div className={`rounded-xl border p-5 text-sm ${ring}`}>
      {title && <div className="font-semibold">{title}</div>}
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
      ? "text-[var(--danger)]"
      : signed && cents > 0
        ? "text-[var(--accent)]"
        : "";
  return <span className={`tabular ${tone}`}>{formatMoney(cents)}</span>;
}

// ───────── Avatar ─────────

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
        className="rounded-full object-cover bg-[var(--surface-warm)] border border-[var(--border)]"
      />
    );
  }
  return (
    <div
      style={{ width: size, height: size, fontSize: size * 0.36 }}
      className="grid place-items-center rounded-full bg-[var(--surface-warm)] border border-[var(--border)] text-[var(--muted)] font-semibold"
      aria-hidden
    >
      {initials || "?"}
    </div>
  );
}

// ───────── Buttons ─────────

export function ButtonLink({
  href,
  children,
  variant = "primary",
}: {
  href: string;
  children: ReactNode;
  variant?: "primary" | "ghost" | "gold";
}) {
  const base =
    "inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-all duration-200 hover:-translate-y-0.5";
  const variantClass =
    variant === "primary"
      ? "bg-[var(--foreground)] text-white hover:shadow-[0_8px_24px_rgba(15,23,42,0.20)]"
      : variant === "gold"
        ? "bg-[var(--gold)] text-white hover:bg-[#b88a36] hover:shadow-[0_8px_24px_rgba(200,157,74,0.25)]"
        : "border border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--surface-warm)]";
  return (
    <Link href={href} className={`${base} ${variantClass}`}>
      {children}
    </Link>
  );
}

// ───────── Section heading ─────────

export function SectionHeader({
  title,
  hint,
}: {
  title: string;
  hint?: ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 mb-3">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
        {title}
      </h2>
      {hint && <div className="text-xs text-[var(--muted)]">{hint}</div>}
    </div>
  );
}
