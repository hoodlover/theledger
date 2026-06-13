// Receipt classifier — calls Claude with native PDF/image support and
// returns structured {merchant, purchase_date, total_cents, tax_cents,
// tip_cents, confidence}. Reused by /receipts/upload and the
// watch-drop.ts watcher.

import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-sonnet-4-5";

export type ReceiptKind = "pdf" | "jpeg" | "png" | "webp" | "unknown";

export function sniffMagicBytesFromBuffer(buf: Buffer): ReceiptKind {
  if (buf.length < 12) return "unknown";
  if (buf.slice(0, 5).toString("ascii") === "%PDF-") return "pdf";
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47)
    return "png";
  // WEBP magic: RIFF....WEBP
  if (
    buf.slice(0, 4).toString("ascii") === "RIFF" &&
    buf.slice(8, 12).toString("ascii") === "WEBP"
  )
    return "webp";
  // Anthropic vision API does not support HEIC. iOS Safari sends JPEG by
  // default for <input type=file accept=image/*> uploads, so this is rarely
  // a problem in practice.
  return "unknown";
}

export type ReceiptClassification = {
  merchant: string | null;
  purchase_date: string | null; // YYYY-MM-DD
  total_cents: number | null;
  tax_cents: number | null;
  tip_cents: number | null;
  confidence: number; // 0..1
  ocr_text: string | null;
};

const RECEIPT_PROMPT = `Extract the structured fields from this receipt image / PDF.

Respond ONLY with valid JSON (no prose, no markdown fences) matching:
{
  "merchant": string | null,             // store / vendor name
  "purchase_date": "YYYY-MM-DD" | null,
  "total_cents": integer | null,         // POSITIVE integer cents (the receipt total paid)
  "tax_cents": integer | null,
  "tip_cents": integer | null,
  "confidence": 0.0 to 1.0,
  "ocr_text": string | null              // the raw text you read; null if image is too noisy
}

Be conservative on confidence — return < 0.5 if the image is blurry, partial, or the total / date is unreadable.`;

export async function classifyReceipt(
  bytes: Buffer,
  kind: ReceiptKind,
  apiKey: string
): Promise<ReceiptClassification | null> {
  if (kind === "unknown") return null;

  const base64 = bytes.toString("base64");
  const block =
    kind === "pdf"
      ? ({
          type: "document",
          source: {
            type: "base64",
            media_type: "application/pdf",
            data: base64,
          },
        } as const)
      : ({
          type: "image",
          source: {
            type: "base64",
            media_type:
              kind === "png"
                ? "image/png"
                : kind === "webp"
                  ? "image/webp"
                  : "image/jpeg",
            data: base64,
          },
        } as const);

  const anthropic = new Anthropic({ apiKey });

  const resp = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2048,
    messages: [
      {
        role: "user",
        content: [block, { type: "text", text: RECEIPT_PROMPT }],
      },
    ],
  });

  const text = resp.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(cleaned) as ReceiptClassification;
  } catch (err) {
    console.error("classifier returned non-JSON:", text.slice(0, 500));
    return null;
  }
}

export function mimeForKind(kind: ReceiptKind): string {
  switch (kind) {
    case "pdf":
      return "application/pdf";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "jpeg":
      return "image/jpeg";
    default:
      return "application/octet-stream";
  }
}

export function extForKind(kind: ReceiptKind): string {
  switch (kind) {
    case "pdf":
      return "pdf";
    case "png":
      return "png";
    case "webp":
      return "webp";
    case "jpeg":
      return "jpg";
    default:
      return "bin";
  }
}
