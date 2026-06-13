import { NextRequest } from "next/server";
import { put } from "@vercel/blob";
import { db } from "@/lib/db";
import { llcPaperwork, entities } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function nullable(s: string | null): string | null {
  const t = (s ?? "").trim();
  return t.length ? t : null;
}

export async function POST(req: NextRequest) {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token)
    return Response.json(
      { error: "BLOB_READ_WRITE_TOKEN not configured" },
      { status: 500 }
    );

  const form = await req.formData();
  const entityId = String(form.get("entityId") ?? "");
  const docKind = String(form.get("docKind") ?? "misc");
  const filedDate = nullable(String(form.get("filedDate") ?? ""));
  const expiresDate = nullable(String(form.get("expiresDate") ?? ""));
  const notes = nullable(String(form.get("notes") ?? ""));
  const file = form.get("file");

  if (!entityId) return Response.json({ error: "entityId required" }, { status: 400 });
  if (!docKind) return Response.json({ error: "docKind required" }, { status: 400 });
  if (!(file instanceof File))
    return Response.json({ error: "file required" }, { status: 400 });

  const [entity] = await db
    .select()
    .from(entities)
    .where(eq(entities.id, entityId));
  if (!entity)
    return Response.json({ error: "unknown entity" }, { status: 400 });

  const buf = Buffer.from(await file.arrayBuffer());
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const safeName = (file.name || "doc").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
  const blobKey = `vault/the-ledger/docs/${entity.slug}/${ts}-${docKind}-${safeName}`;
  const contentType = file.type || "application/octet-stream";

  const uploaded = await put(blobKey, buf, {
    access: "public",
    contentType,
    addRandomSuffix: false,
    token,
  });

  const [created] = await db
    .insert(llcPaperwork)
    .values({
      entityId,
      docKind,
      filedDate,
      expiresDate,
      blobUrl: uploaded.url,
      notes,
    })
    .returning({ id: llcPaperwork.id });

  await logAudit({
    eventKind: "doc.upload",
    summary: `Uploaded ${docKind.replace(/_/g, " ")} for ${entity.name}`,
    resourceKind: "document",
    resourceId: created.id,
    meta: { entitySlug: entity.slug, docKind, filename: file.name },
  });

  return Response.json({ id: created.id, blobUrl: uploaded.url });
}
