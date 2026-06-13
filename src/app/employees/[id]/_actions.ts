"use server";

import { db } from "@/lib/db";
import { employees } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

function nullable(s: string | null | undefined): string | null {
  const t = (s ?? "").trim();
  return t.length ? t : null;
}

export async function updateEmployee(
  id: string,
  patch: {
    legalName?: string;
    employeeKind?: "standard_w2" | "minor_child";
    dateOfBirth?: string | null;
    hireDate?: string | null;
    termDate?: string | null;
    address?: string | null;
    defaultPropertyTag?: string | null;
  }
) {
  const set: Record<string, unknown> = {};
  if (patch.legalName !== undefined) set.legalName = patch.legalName.trim();
  if (patch.employeeKind !== undefined) set.employeeKind = patch.employeeKind;
  if (patch.dateOfBirth !== undefined) set.dateOfBirth = nullable(patch.dateOfBirth);
  if (patch.hireDate !== undefined) set.hireDate = nullable(patch.hireDate);
  if (patch.termDate !== undefined) set.termDate = nullable(patch.termDate);
  if (patch.address !== undefined) set.address = nullable(patch.address);
  if (patch.defaultPropertyTag !== undefined)
    set.defaultPropertyTag = nullable(patch.defaultPropertyTag);

  if (Object.keys(set).length === 0) return;

  await db.update(employees).set(set).where(eq(employees.id, id));
  revalidatePath("/employees");
  revalidatePath(`/employees/${id}`);
}

export async function deleteEmployee(id: string) {
  await db.delete(employees).where(eq(employees.id, id));
  revalidatePath("/employees");
  revalidatePath("/transactions");
}
