"use server";

import { db } from "@/lib/db";
import { entities } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

function nullable(s: string | null | undefined): string | null {
  const t = (s ?? "").trim();
  return t.length ? t : null;
}

function dollarsToCents(s: string | null | undefined): number | null {
  if (!s) return null;
  const cleaned = String(s).replace(/[$,\s]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

export async function saveEntity(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("entity id required");

  const slug = String(formData.get("slug") ?? "");

  await db
    .update(entities)
    .set({
      name: String(formData.get("name") ?? "").trim(),
      ein: nullable(String(formData.get("ein") ?? "")),
      state: nullable(String(formData.get("state") ?? "")),
      formationDate: nullable(String(formData.get("formationDate") ?? "")),
      registeredAgent: nullable(String(formData.get("registeredAgent") ?? "")),
      mailingAddress: nullable(String(formData.get("mailingAddress") ?? "")),
      phone: nullable(String(formData.get("phone") ?? "")),
      stateEmployerId: nullable(String(formData.get("stateEmployerId") ?? "")),
      propertyAddress: nullable(String(formData.get("propertyAddress") ?? "")),
      propertyPurchaseDate: nullable(
        String(formData.get("propertyPurchaseDate") ?? "")
      ),
      propertyPurchasePriceCents: dollarsToCents(
        String(formData.get("propertyPurchasePriceDollars") ?? "")
      ),
      rentalClassification: nullable(
        String(formData.get("rentalClassification") ?? "")
      ),
      depreciationBasisCents: dollarsToCents(
        String(formData.get("depreciationBasisDollars") ?? "")
      ),
      depreciationInServiceDate: nullable(
        String(formData.get("depreciationInServiceDate") ?? "")
      ),
      depreciationMacrsClass: nullable(
        String(formData.get("depreciationMacrsClass") ?? "")
      ),
      notes: nullable(String(formData.get("notes") ?? "")),
    })
    .where(eq(entities.id, id));

  revalidatePath("/entities");
  revalidatePath(`/entities/${slug}`);
  revalidatePath("/properties");
  revalidatePath("/");
  redirect(`/entities/${slug}`);
}
