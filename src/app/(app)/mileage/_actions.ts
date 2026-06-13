"use server";

import { db } from "@/lib/db";
import { mileageEntries } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireCurrentUser } from "@/lib/current-user";
import { logAudit } from "@/lib/audit";

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
  const [created] = await db.insert(mileageEntries).values({
    entityId: input.entityId,
    enteredByUserId: user.id,
    tripDate: input.tripDate,
    miles: input.miles,
    vehicleLabel: nullable(input.vehicleLabel),
    startLocation: nullable(input.startLocation),
    endLocation: nullable(input.endLocation),
    businessPurpose: nullable(input.businessPurpose),
    notes: nullable(input.notes),
  }).returning({ id: mileageEntries.id });
  await logAudit({
    eventKind: "mileage.add",
    summary: `Logged ${input.miles.toFixed(1)} mi on ${input.tripDate}${input.businessPurpose ? ` — ${input.businessPurpose}` : ""}`,
    resourceKind: "mileage",
    resourceId: created.id,
    meta: { miles: input.miles, entityId: input.entityId },
  });
  revalidatePath("/mileage");
}

export async function deleteMileage(id: string) {
  await db.delete(mileageEntries).where(eq(mileageEntries.id, id));
  revalidatePath("/mileage");
}
