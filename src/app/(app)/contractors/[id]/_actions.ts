"use server";

import { put } from "@vercel/blob";
import { db } from "@/lib/db";
import { contractors, entities } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

function nullable(s: string | null | undefined): string | null {
  const t = (s ?? "").trim();
  return t.length ? t : null;
}

export async function updateContractor(
  id: string,
  patch: {
    legalName?: string;
    dba?: string | null;
    role?: string | null;
    address?: string | null;
    einOrSsn?: string | null;
    startedDate?: string | null;
    endedDate?: string | null;
  }
) {
  const set: Record<string, unknown> = {};
  if (patch.legalName !== undefined) set.legalName = patch.legalName.trim();
  if (patch.dba !== undefined) set.dba = nullable(patch.dba);
  if (patch.role !== undefined) set.role = nullable(patch.role);
  if (patch.address !== undefined) set.address = nullable(patch.address);
  if (patch.einOrSsn !== undefined)
    set.einOrSsnEncrypted = nullable(patch.einOrSsn);
  if (patch.startedDate !== undefined)
    set.startedDate = nullable(patch.startedDate);
  if (patch.endedDate !== undefined)
    set.endedDate = nullable(patch.endedDate);

  if (Object.keys(set).length === 0) return;
  await db.update(contractors).set(set).where(eq(contractors.id, id));
  revalidatePath("/contractors");
  revalidatePath(`/contractors/${id}`);
}

export async function uploadW9(formData: FormData): Promise<{ ok: boolean; error?: string; blobUrl?: string }> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return { ok: false, error: "BLOB_READ_WRITE_TOKEN not configured" };

  const contractorId = String(formData.get("contractorId") ?? "");
  const file = formData.get("file");
  if (!contractorId) return { ok: false, error: "contractorId required" };
  if (!(file instanceof File)) return { ok: false, error: "file required" };

  const [c] = await db.select().from(contractors).where(eq(contractors.id, contractorId));
  if (!c) return { ok: false, error: "contractor not found" };
  const [entity] = await db.select().from(entities).where(eq(entities.id, c.entityId));
  if (!entity) return { ok: false, error: "owning entity missing" };

  const buf = Buffer.from(await file.arrayBuffer());
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const safeName = (file.name || "w9.pdf").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
  const slug = c.legalName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const blobKey = `vault/the-ledger/w9s/${entity.slug}/${slug}/${ts}-${safeName}`;

  const uploaded = await put(blobKey, buf, {
    access: "public",
    contentType: file.type || "application/octet-stream",
    addRandomSuffix: false,
    token,
  });

  await db
    .update(contractors)
    .set({ w9DocUrl: uploaded.url })
    .where(eq(contractors.id, contractorId));

  revalidatePath("/contractors");
  revalidatePath(`/contractors/${contractorId}`);
  return { ok: true, blobUrl: uploaded.url };
}

export async function removeW9(contractorId: string) {
  await db
    .update(contractors)
    .set({ w9DocUrl: null })
    .where(eq(contractors.id, contractorId));
  revalidatePath("/contractors");
  revalidatePath(`/contractors/${contractorId}`);
}

export async function deleteContractor(id: string) {
  await db.delete(contractors).where(eq(contractors.id, id));
  revalidatePath("/contractors");
  revalidatePath("/transactions");
}
