import { NextRequest } from "next/server";
import { put } from "@vercel/blob";
import { db } from "@/lib/db";
import { receipts, transactions, entities } from "@/lib/db/schema";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import {
  sniffMagicBytesFromBuffer,
  classifyReceipt,
  extForKind,
  mimeForKind,
} from "@/lib/receipt-classify";

export const dynamic = "force-dynamic";
// Body size limit on Vercel is generous for /receipts/upload — phone
// receipts top out around 5MB.
export const maxDuration = 60;

const MATCH_AMOUNT_TOLERANCE_CENTS = 50; // $0.50
const MATCH_DATE_WINDOW_DAYS = 5;

function shiftDate(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function POST(req: NextRequest) {
  const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!blobToken)
    return Response.json(
      { error: "BLOB_READ_WRITE_TOKEN not configured" },
      { status: 500 }
    );
  if (!anthropicKey)
    return Response.json(
      { error: "ANTHROPIC_API_KEY not configured" },
      { status: 500 }
    );

  const form = await req.formData();
  const entityId = String(form.get("entityId") ?? "");
  const file = form.get("file");
  if (!entityId)
    return Response.json({ error: "entityId required" }, { status: 400 });
  if (!(file instanceof File))
    return Response.json({ error: "file required" }, { status: 400 });

  const [entity] = await db
    .select()
    .from(entities)
    .where(eq(entities.id, entityId));
  if (!entity)
    return Response.json({ error: "unknown entity" }, { status: 400 });

  const buf = Buffer.from(await file.arrayBuffer());
  const kind = sniffMagicBytesFromBuffer(buf);
  if (kind === "unknown")
    return Response.json(
      { error: "unrecognized file format (PDF, JPEG, PNG, WEBP, HEIC only)" },
      { status: 400 }
    );

  // Upload to Vercel Blob (shared with cobbvault). Path follows the same
  // convention as cobbvault — vault/the-ledger/receipts/<entity>/<ts>-<file>
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const safeName = (file.name || "receipt").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
  const ext = extForKind(kind);
  const blobKey = `vault/the-ledger/receipts/${entity.slug}/${ts}-${safeName}.${ext}`;

  const uploaded = await put(blobKey, buf, {
    access: "public",
    contentType: mimeForKind(kind),
    addRandomSuffix: false,
    token: blobToken,
  });

  // Classify via Claude
  const classification = await classifyReceipt(buf, kind, anthropicKey);

  // Insert receipt row
  const [created] = await db
    .insert(receipts)
    .values({
      entityId,
      merchant: classification?.merchant ?? null,
      purchaseDate: classification?.purchase_date ?? null,
      totalCents: classification?.total_cents ?? null,
      taxCents: classification?.tax_cents ?? null,
      tipCents: classification?.tip_cents ?? null,
      blobUrl: uploaded.url,
      source: "phone_upload",
      ocrRawText: classification?.ocr_text ?? null,
      classifiedAt: classification ? new Date() : null,
      confidence: classification?.confidence ?? null,
    })
    .returning();

  // Try to auto-match to a transaction
  let matchedTxnId: string | null = null;
  if (
    classification &&
    classification.total_cents &&
    classification.purchase_date
  ) {
    // Receipt total is POSITIVE (paid X). Transaction is NEGATIVE (-X).
    const targetCents = -classification.total_cents;
    const lo = targetCents - MATCH_AMOUNT_TOLERANCE_CENTS;
    const hi = targetCents + MATCH_AMOUNT_TOLERANCE_CENTS;
    const dateLo = shiftDate(classification.purchase_date, -MATCH_DATE_WINDOW_DAYS);
    const dateHi = shiftDate(classification.purchase_date, +MATCH_DATE_WINDOW_DAYS);

    const candidates = await db
      .select({ id: transactions.id, entityId: transactions.entityId })
      .from(transactions)
      .where(
        and(
          gte(transactions.amountCents, lo),
          lte(transactions.amountCents, hi),
          gte(transactions.postedDate, dateLo),
          lte(transactions.postedDate, dateHi)
        )
      );

    // Prefer same-entity matches; flag cross-entity for review.
    const sameEntity = candidates.filter((c) => c.entityId === entityId);
    const pickPool = sameEntity.length > 0 ? sameEntity : candidates;
    if (pickPool.length === 1) {
      matchedTxnId = pickPool[0].id;
      await db
        .update(receipts)
        .set({
          matchedTransactionId: matchedTxnId,
          matchedAt: new Date(),
          matchMethod: "auto",
        })
        .where(eq(receipts.id, created.id));
      await db
        .update(transactions)
        .set({ attachedReceiptId: created.id })
        .where(eq(transactions.id, matchedTxnId));
    }
  }

  return Response.json({
    receiptId: created.id,
    blobUrl: uploaded.url,
    classification,
    matchedTransactionId: matchedTxnId,
  });
}
