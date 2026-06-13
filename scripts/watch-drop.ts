/**
 * Drop-folder watcher for Tax Ledger.
 *
 * Watches DROP_FOLDER_PATH, sniffs magic bytes (NOT the extension —
 * Bluevine downloads PDFs with no extension; cobbvault's importer silently
 * drops them; do not repeat that bug), classifies each file via Anthropic
 * with native PDF support, and either ingests it into the DB or routes it
 * to a REVIEW subfolder for human triage.
 *
 * v0 scope: statements only. Other doc types land in REVIEW with a
 * classification sidecar.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { promises as fs, createReadStream } from "node:fs";
import path from "node:path";
import chokidar from "chokidar";
import Anthropic from "@anthropic-ai/sdk";

const DROP_FOLDER = process.env.DROP_FOLDER_PATH;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const CONFIDENCE_THRESHOLD = 0.7;
const MODEL = "claude-sonnet-4-5";

if (!DROP_FOLDER) {
  console.error("DROP_FOLDER_PATH is not set in .env.local");
  process.exit(1);
}
if (!ANTHROPIC_KEY) {
  console.error("ANTHROPIC_API_KEY is not set in .env.local");
  process.exit(1);
}

const anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY });

// ───────── Magic-byte sniff ─────────
type FileKind = "pdf" | "jpeg" | "png" | "unknown";

async function sniffMagicBytes(filePath: string): Promise<FileKind> {
  const fh = await fs.open(filePath, "r");
  try {
    const buf = Buffer.alloc(8);
    await fh.read(buf, 0, 8, 0);
    if (buf.slice(0, 5).toString("ascii") === "%PDF-") return "pdf";
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
    if (
      buf[0] === 0x89 &&
      buf[1] === 0x50 &&
      buf[2] === 0x4e &&
      buf[3] === 0x47
    )
      return "png";
    return "unknown";
  } finally {
    await fh.close();
  }
}

// ───────── Classifier ─────────
type Classification = {
  document_type:
    | "bank_statement"
    | "credit_card_statement"
    | "receipt"
    | "1099_nec"
    | "1099_misc"
    | "w9"
    | "w2"
    | "tax_return"
    | "unknown";
  institution: string | null;
  entity_guess: string | null;
  last4: string | null;
  period_start: string | null;
  period_end: string | null;
  transactions: Array<{
    posted_date: string;
    amount_cents: number; // negative = debit/expense, positive = credit/deposit
    description: string;
  }> | null;
  confidence: number;
};

const CLASSIFIER_PROMPT = `You are classifying a financial document for a tax-ledger app.

Respond with ONLY valid JSON matching this schema (no prose, no markdown fences):

{
  "document_type": "bank_statement" | "credit_card_statement" | "receipt" | "1099_nec" | "1099_misc" | "w9" | "w2" | "tax_return" | "unknown",
  "institution": string | null,         // e.g. "Bluevine", "BofA", "IRS"
  "entity_guess": string | null,        // best-match entity name from the list below
  "last4": string | null,               // last 4 of the account number
  "period_start": "YYYY-MM-DD" | null,
  "period_end": "YYYY-MM-DD" | null,
  "transactions": [{ "posted_date": "YYYY-MM-DD", "amount_cents": <integer>, "description": string }] | null,
  "confidence": 0.0 to 1.0
}

amount_cents: NEGATIVE for debits/expenses/withdrawals, POSITIVE for credits/deposits/income. Integer cents only.

Available entities:
- "Path to Change LLC"
- "PTC Havens LLC"
- "H&L Place of Grace LLC"
- "H&L Havens LLC"
- "CFS LLC"
- "Personal Joint — Lance & Heather Cobb"

Bluevine sub-account → entity mapping:
- last4 9058 → H&L Place of Grace LLC
- last4 6242 → PTC Havens LLC
- last4 6628 → H&L Havens LLC
- last4 8845 → H&L Havens LLC
- last4 6259 → Personal Joint — Lance & Heather Cobb

Be conservative on confidence — return < 0.7 if anything is ambiguous, the document looks corrupted, or you can't determine the entity. Only set transactions for bank_statement or credit_card_statement.`;

async function classifyDocument(
  filePath: string,
  kind: FileKind
): Promise<Classification | null> {
  const data = await fs.readFile(filePath);
  const base64 = data.toString("base64");

  const sourceBlock =
    kind === "pdf"
      ? ({
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: base64 },
        } as const)
      : ({
          type: "image",
          source: {
            type: "base64",
            media_type: kind === "png" ? "image/png" : "image/jpeg",
            data: base64,
          },
        } as const);

  const resp = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 8192,
    messages: [
      {
        role: "user",
        content: [
          sourceBlock,
          { type: "text", text: CLASSIFIER_PROMPT },
        ],
      },
    ],
  });

  const text = resp.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  // Be forgiving — strip ```json fences if the model added them despite instructions
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(cleaned) as Classification;
  } catch (err) {
    console.error("Failed to parse classifier response as JSON:", text);
    return null;
  }
}

// ───────── DB ingestion ─────────
async function ingestStatement(
  filePath: string,
  c: Classification
): Promise<{ ingested: boolean; reason?: string }> {
  const { db } = await import("../src/lib/db/index.js");
  const { entities, bankAccounts, statementImports, transactions } =
    await import("../src/lib/db/schema.js");
  const { eq, and } = await import("drizzle-orm");

  if (!c.entity_guess) return { ingested: false, reason: "no entity guess" };

  const entity = (
    await db.select().from(entities).where(eq(entities.name, c.entity_guess))
  )[0];
  if (!entity)
    return { ingested: false, reason: `no entity match for "${c.entity_guess}"` };

  // Match bank account by entity + institution + last4 if we have one
  const accountCandidates = await db
    .select()
    .from(bankAccounts)
    .where(eq(bankAccounts.entityId, entity.id));

  let account = accountCandidates.find(
    (a) =>
      (!c.institution || a.institution === c.institution) &&
      (!c.last4 || a.last4 === c.last4)
  );
  if (!account && accountCandidates.length === 1) {
    account = accountCandidates[0];
  }
  if (!account)
    return {
      ingested: false,
      reason: `no bank_account match (entity=${entity.slug} institution=${c.institution} last4=${c.last4})`,
    };

  const [imp] = await db
    .insert(statementImports)
    .values({
      entityId: entity.id,
      bankAccountId: account.id,
      sourceFilename: path.basename(filePath),
      periodStart: c.period_start,
      periodEnd: c.period_end,
      blobUrl: null,
    })
    .returning();

  if (c.transactions && c.transactions.length > 0) {
    await db.insert(transactions).values(
      c.transactions.map((t) => ({
        statementImportId: imp.id,
        bankAccountId: account!.id,
        entityId: entity.id,
        postedDate: t.posted_date,
        amountCents: t.amount_cents,
        rawDescription: t.description,
      }))
    );
  }

  return { ingested: true };
}

// ───────── Routing ─────────
async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

async function moveTo(
  filePath: string,
  destDir: string,
  sidecar?: Record<string, unknown>
) {
  await ensureDir(destDir);
  const dest = path.join(destDir, path.basename(filePath));
  await fs.rename(filePath, dest);
  if (sidecar) {
    await fs.writeFile(dest + ".classification.json", JSON.stringify(sidecar, null, 2));
  }
  return dest;
}

async function handleFile(filePath: string) {
  const rel = path.relative(DROP_FOLDER!, filePath);
  console.log(`\n→ ${rel}`);

  // Skip dot-files, sidecars, and the routing dirs
  const base = path.basename(filePath);
  if (base.startsWith(".") || base.endsWith(".classification.json")) return;
  if (filePath.includes(`${path.sep}Imported${path.sep}`)) return;
  if (filePath.includes(`${path.sep}REVIEW${path.sep}`)) return;

  const kind = await sniffMagicBytes(filePath);
  console.log(`  magic bytes → ${kind}`);

  if (kind === "unknown") {
    const dest = await moveTo(filePath, path.join(DROP_FOLDER!, "REVIEW"), {
      reason: "unrecognized magic bytes",
    });
    console.log(`  REVIEW ← ${dest}`);
    return;
  }

  const classification = await classifyDocument(filePath, kind);
  if (!classification) {
    await moveTo(filePath, path.join(DROP_FOLDER!, "REVIEW"), {
      reason: "classifier returned unparseable JSON",
    });
    console.log("  REVIEW ← classifier parse error");
    return;
  }

  console.log(
    `  ${classification.document_type} · ${classification.institution ?? "?"} · ${classification.entity_guess ?? "?"} · last4=${classification.last4 ?? "?"} · conf=${classification.confidence}`
  );

  const isStatement =
    classification.document_type === "bank_statement" ||
    classification.document_type === "credit_card_statement";

  if (!isStatement) {
    const dest = await moveTo(filePath, path.join(DROP_FOLDER!, "REVIEW"), classification);
    console.log(`  REVIEW ← non-statement doc (v0 handles statements only)`);
    return;
  }

  if (classification.confidence < CONFIDENCE_THRESHOLD) {
    const dest = await moveTo(filePath, path.join(DROP_FOLDER!, "REVIEW"), classification);
    console.log(`  REVIEW ← low confidence (${classification.confidence} < ${CONFIDENCE_THRESHOLD})`);
    return;
  }

  const result = await ingestStatement(filePath, classification);
  if (!result.ingested) {
    await moveTo(filePath, path.join(DROP_FOLDER!, "REVIEW"), {
      ...classification,
      ingest_failure: result.reason,
    });
    console.log(`  REVIEW ← ingest failed: ${result.reason}`);
    return;
  }

  // Success: move to Imported/<year>/<entity-slug>/
  const year = (classification.period_end ?? classification.period_start ?? new Date().toISOString().slice(0, 10)).slice(0, 4);
  const slug = classification.entity_guess
    ? classification.entity_guess.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
    : "unknown";
  const dest = await moveTo(
    filePath,
    path.join(DROP_FOLDER!, "Imported", year, slug)
  );
  console.log(`  ingested · moved → ${path.relative(DROP_FOLDER!, dest)}`);
}

// ───────── Bootstrap ─────────
async function main() {
  await ensureDir(DROP_FOLDER!);
  console.log(`Watching ${DROP_FOLDER}`);
  console.log(`Model: ${MODEL}  ·  confidence threshold: ${CONFIDENCE_THRESHOLD}`);
  console.log("Magic-byte sniff: %PDF-, JPEG \\xFF\\xD8\\xFF, PNG \\x89PNG");
  console.log("Drop a statement (PDF, JPEG, or PNG) under DROP_FOLDER_PATH to ingest.\n");

  const watcher = chokidar.watch(DROP_FOLDER!, {
    ignored: (p) =>
      p.includes(`${path.sep}Imported${path.sep}`) ||
      p.includes(`${path.sep}REVIEW${path.sep}`) ||
      path.basename(p).startsWith(".") ||
      p.endsWith(".classification.json"),
    persistent: true,
    awaitWriteFinish: { stabilityThreshold: 1500, pollInterval: 200 },
    ignoreInitial: false,
  });

  watcher.on("add", (p) => {
    handleFile(p).catch((err) => console.error(`Error handling ${p}:`, err));
  });

  watcher.on("error", (err) => console.error("watcher error:", err));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
