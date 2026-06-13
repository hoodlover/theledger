import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { entities } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import {
  Page,
  PageHeader,
  Card,
  Callout,
} from "@/components/ui";
import { MACRS_CLASSES } from "@/lib/depreciation";
import { saveEntity } from "./_actions";

export const dynamic = "force-dynamic";

const RENTAL_OPTIONS = [
  { value: "n_a", label: "Not a rental" },
  { value: "ltr", label: "Long-term rental (Schedule E)" },
  { value: "str", label: "Short-term rental (Schedule C — material participation)" },
];

const KIND_LABEL: Record<string, string> = {
  s_corp: "S-Corporation",
  llc: "Limited Liability Co.",
  sole_prop: "Sole Proprietorship",
  individual: "Personal · Joint",
};

export default async function EntityEditPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [entity] = await db.select().from(entities).where(eq(entities.slug, slug));
  if (!entity) notFound();

  const purchaseDollars =
    entity.propertyPurchasePriceCents != null
      ? (entity.propertyPurchasePriceCents / 100).toFixed(2)
      : "";
  const basisDollars =
    entity.depreciationBasisCents != null
      ? (entity.depreciationBasisCents / 100).toFixed(2)
      : "";

  return (
    <Page>
      <PageHeader
        title={`Edit ${entity.name}`}
        subtitle={
          <>
            {KIND_LABEL[entity.kind] ?? entity.kind} — non-form fields (kind,
            slug, ID) aren&apos;t editable here.
          </>
        }
        actions={
          <Link
            href={`/entities/${slug}`}
            className="rounded-full border border-[var(--border)] px-4 py-1.5 text-sm text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface-warm)] transition-colors"
          >
            &larr; Cancel
          </Link>
        }
      />

      <Callout title="Saving updates the dashboard, /properties, /entities, and the per-entity detail." tone="info">
        Money values can be entered as <code>500000</code>, <code>500,000</code>,
        or <code>$500,000.00</code>. Dates use the browser&apos;s date picker.
      </Callout>

      <form action={saveEntity} className="space-y-8">
        <input type="hidden" name="id" value={entity.id} />
        <input type="hidden" name="slug" value={entity.slug} />

        {/* Identity */}
        <Card className="p-6 space-y-4">
          <SectionTitle>Identity</SectionTitle>
          <Field label="Legal name">
            <input
              name="name"
              defaultValue={entity.name}
              required
              className={input}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="EIN">
              <input
                name="ein"
                defaultValue={entity.ein ?? ""}
                placeholder="82-1116780"
                className={input + " tabular"}
              />
            </Field>
            <Field label="State of formation">
              <input
                name="state"
                defaultValue={entity.state ?? ""}
                placeholder="GA"
                maxLength={2}
                className={input}
              />
            </Field>
            <Field label="Formation date">
              <input
                type="date"
                name="formationDate"
                defaultValue={entity.formationDate ?? ""}
                className={input + " tabular"}
              />
            </Field>
          </div>
          <Field label="Registered agent">
            <input
              name="registeredAgent"
              defaultValue={entity.registeredAgent ?? ""}
              placeholder="e.g. Lance Cobb (self) or third-party agent"
              className={input}
            />
          </Field>
        </Card>

        {/* Contact */}
        <Card className="p-6 space-y-4">
          <SectionTitle>Contact / payer info (1099 + W-2)</SectionTitle>
          <Field label="Mailing address (1099 / W-2 PAYER line)">
            <input
              name="mailingAddress"
              defaultValue={entity.mailingAddress ?? ""}
              placeholder="314 Tribble Gap Road, Suite B, Cumming GA 30040"
              className={input}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Phone">
              <input
                name="phone"
                defaultValue={entity.phone ?? ""}
                placeholder="(770) 615-6115"
                className={input + " tabular"}
              />
            </Field>
            <Field label="GA employer ID (W-2 box 15)">
              <input
                name="stateEmployerId"
                defaultValue={entity.stateEmployerId ?? ""}
                placeholder="3255358-RU"
                className={input + " tabular"}
              />
            </Field>
          </div>
        </Card>

        {/* Property */}
        <Card className="p-6 space-y-4">
          <SectionTitle>Property</SectionTitle>
          <Field label="Property address">
            <input
              name="propertyAddress"
              defaultValue={entity.propertyAddress ?? ""}
              placeholder="3220 Continental Ave, Cumming GA 30041"
              className={input}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Purchase date">
              <input
                type="date"
                name="propertyPurchaseDate"
                defaultValue={entity.propertyPurchaseDate ?? ""}
                className={input + " tabular"}
              />
            </Field>
            <Field label="Purchase price ($)">
              <input
                name="propertyPurchasePriceDollars"
                defaultValue={purchaseDollars}
                placeholder="500000.00"
                inputMode="decimal"
                className={input + " tabular"}
              />
            </Field>
            <Field label="Rental classification">
              <select
                name="rentalClassification"
                defaultValue={entity.rentalClassification ?? "n_a"}
                className={input}
              >
                {RENTAL_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </Card>

        {/* Depreciation */}
        <Card className="p-6 space-y-4">
          <SectionTitle>Depreciation (straight-line MACRS)</SectionTitle>
          <p className="text-xs text-[var(--muted)] -mt-2">
            Cost basis usually = purchase price minus land value. Lance&apos;s
            CPA produces the official schedule; what&apos;s here feeds the
            dashboard estimate on /properties.
          </p>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Depreciable basis ($)">
              <input
                name="depreciationBasisDollars"
                defaultValue={basisDollars}
                placeholder="400000.00"
                inputMode="decimal"
                className={input + " tabular"}
              />
            </Field>
            <Field label="In-service date">
              <input
                type="date"
                name="depreciationInServiceDate"
                defaultValue={entity.depreciationInServiceDate ?? ""}
                className={input + " tabular"}
              />
            </Field>
            <Field label="MACRS class">
              <select
                name="depreciationMacrsClass"
                defaultValue={entity.depreciationMacrsClass ?? ""}
                className={input}
              >
                <option value="">— None / not depreciable —</option>
                {MACRS_CLASSES.map((c) => (
                  <option key={c.kind} value={c.kind}>
                    {c.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </Card>

        {/* Notes */}
        <Card className="p-6 space-y-4">
          <SectionTitle>Notes</SectionTitle>
          <Field label="Free-form notes">
            <textarea
              name="notes"
              defaultValue={entity.notes ?? ""}
              rows={4}
              className={input}
            />
          </Field>
        </Card>

        <div className="flex justify-end gap-2">
          <Link
            href={`/entities/${slug}`}
            className="rounded-full border border-[var(--border)] px-5 py-2.5 text-sm text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface-warm)] transition-colors"
          >
            Cancel
          </Link>
          <button
            type="submit"
            className="rounded-full bg-[var(--foreground)] px-6 py-2.5 text-sm font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(15,23,42,0.20)]"
          >
            Save entity
          </button>
        </div>
      </form>
    </Page>
  );
}

const input =
  "w-full rounded-lg border border-[var(--border)] bg-[var(--surface-warm)] px-3 py-2 text-sm focus:bg-white focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20 transition-colors";

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
      {children}
    </h2>
  );
}

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
