"use server";

import { put } from "@vercel/blob";
import { db } from "@/lib/db";
import { contractors, entities } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { logAudit } from "@/lib/audit";

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
    feeKeepPercent?: number | null;
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
  if (patch.feeKeepPercent !== undefined) {
    const n = patch.feeKeepPercent;
    set.feeKeepPercent =
      n === null || Number.isNaN(n) || n < 0 || n > 100 ? null : Math.round(n);
  }

  if (Object.keys(set).length === 0) return;
  await db.update(contractors).set(set).where(eq(contractors.id, id));
  revalidatePath("/contractors");
  revalidatePath(`/contractors/${id}`);
}

export async function setW9OnFile(id: string, onFile: boolean) {
  await db
    .update(contractors)
    .set({ w9OnFile: onFile })
    .where(eq(contractors.id, id));
  await logAudit({
    eventKind: onFile ? "w9.on_file" : "w9.off_file",
    summary: onFile
      ? "Marked W-9 as on file (no PDF uploaded)"
      : "Unmarked W-9 as on file",
    resourceKind: "contractor",
    resourceId: id,
  });
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

  // Uploading the PDF implies "on file" — flip the flag too so the
  // "Missing" warning clears in both places.
  await db
    .update(contractors)
    .set({ w9DocUrl: uploaded.url, w9OnFile: true })
    .where(eq(contractors.id, contractorId));

  await logAudit({
    eventKind: "w9.upload",
    summary: `Uploaded W-9 for ${c.dba ?? c.legalName}`,
    resourceKind: "contractor",
    resourceId: contractorId,
    meta: { filename: file.name },
  });

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

/**
 * Tag a specific list of transactions to this contractor. Used by the
 * "untagged matches" panel on the detail page — server already verified
 * each one is in the same entity, so we trust the ids here.
 */
export async function tagTransactionsToContractor(
  contractorId: string,
  transactionIds: string[]
): Promise<{ updated: number }> {
  if (transactionIds.length === 0) return { updated: 0 };
  const { transactions } = await import("@/lib/db/schema");
  const { inArray } = await import("drizzle-orm");
  const res = await db
    .update(transactions)
    .set({ contractorId })
    .where(inArray(transactions.id, transactionIds));
  const updated = res.rowCount ?? transactionIds.length;
  const [c] = await db.select().from(contractors).where(eq(contractors.id, contractorId));
  await logAudit({
    eventKind: "tag.contractor.bulk",
    summary: `Tagged ${updated} txns to "${c?.dba ?? c?.legalName ?? "contractor"}" from match panel`,
    resourceKind: "contractor",
    resourceId: contractorId,
    meta: { count: updated, source: "match_panel" },
  });
  revalidatePath("/transactions");
  revalidatePath(`/contractors/${contractorId}`);
  revalidatePath("/contractors");
  return { updated };
}
