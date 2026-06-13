"use server";

import { db } from "@/lib/db";
import { mileageEntries } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireCurrentUser } from "@/lib/current-user";

function nullable(s: string | null | undefined): string | null {
  const t = (s ?? "").trim();
  return t.length ? t : null;
}

export async function addMileage(input: {
  entityId: string;
  tripDate: string;
  miles: number;
  vehicleLabel?: string;
  startLocation?: string;
  endLocation?: string;
  businessPurpose?: string;
  notes?: string;
}) {
  const user = await requireCurrentUser();
  if (!input.entityId) throw new Error("entity required");
  if (!input.tripDate) throw new Error("date required");
  if (!Number.isFinite(input.miles) || input.miles <= 0) {
    throw new Error("miles must be positive");
  }
  await db.insert(mileageEntries).values({
    entityId: input.entityId,
    enteredByUserId: user.id,
    tripDate: input.tripDate,
    miles: input.miles,
    vehicleLabel: nullable(input.vehicleLabel),
    startLocation: nullable(input.startLocation),
    endLocation: nullable(input.endLocation),
    businessPurpose: nullable(input.businessPurpose),
    notes: nullable(input.notes),
  });
  revalidatePath("/mileage");
}

export async function deleteMileage(id: string) {
  await db.delete(mileageEntries).where(eq(mileageEntries.id, id));
  revalidatePath("/mileage");
}
