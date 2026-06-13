/**
 * Deadline-reminder composer + dispatcher.
 *
 * The cron at /api/cron/deadlines hits runDeadlineReminders() once a day.
 * For every unpaid deadline, we send up to three emails:
 *   T-30: 30 days out (kind hint)
 *   T-7:  one week out (act now)
 *   T-1:  the day before (last call)
 *
 * Each milestone has its own timestamp column on tax_deadlines so the
 * cron never double-sends.
 */
import { db } from "@/lib/db";
import { taxDeadlines, entities, users } from "@/lib/db/schema";
import { and, eq, ne, lte, gte, isNull, or } from "drizzle-orm";
import { sendMail } from "@/lib/mailer";

const KIND_LABEL: Record<string, string> = {
  "1120_s": "Form 1120-S",
  "1040": "Form 1040",
  quarterly_estimated: "Quarterly estimated payment",
  state_annual: "GA LLC annual report",
  "1099_due": "1099-NEC to contractors",
  w2_due: "W-2 to employees",
  "941_quarterly": "Form 941 quarterly",
  "940_annual": "Form 940 annual FUTA",
  eftps_deposit: "EFTPS monthly deposit",
  ga_g7_withholding: "GA G-7 state withholding",
  ga_suta: "GA SUTA (DOL-4N)",
  futa_deposit: "FUTA deposit",
  llc_renewal: "LLC renewal",
  property_tax: "Property tax",
  insurance_renewal: "Insurance renewal",
  mortgage_due: "Mortgage payment",
  registered_agent_renewal: "Registered agent renewal",
};

const SYSTEM_FOR_KIND: Record<string, string> = {
  "1120_s": "IRS",
  "1040": "IRS",
  quarterly_estimated: "IRS / EFTPS",
  state_annual: "GA Secretary of State",
  "1099_due": "IRS / SSA",
  w2_due: "SSA",
  "941_quarterly": "EFTPS",
  "940_annual": "EFTPS",
  eftps_deposit: "EFTPS",
  ga_g7_withholding: "Georgia Tax Center",
  ga_suta: "GA DOL",
  futa_deposit: "EFTPS",
};

type Milestone = { days: number; column: "t30" | "t7" | "t1"; subjectTag: string };
const MILESTONES: Milestone[] = [
  { days: 30, column: "t30", subjectTag: "30 days" },
  { days: 7, column: "t7", subjectTag: "1 week" },
  { days: 1, column: "t1", subjectTag: "TOMORROW" },
];

function daysBetween(due: string, asOf: Date): number {
  const dueD = new Date(due + "T00:00:00Z");
  return Math.round((dueD.getTime() - asOf.getTime()) / 86_400_000);
}

function pickMilestone(daysLeft: number, row: {
  reminderSentT30: Date | null;
  reminderSentT7: Date | null;
  reminderSentT1: Date | null;
}): Milestone | null {
  // Send the most imminent unsent milestone the deadline is past or at
  if (daysLeft <= 1 && !row.reminderSentT1) return MILESTONES[2];
  if (daysLeft <= 7 && !row.reminderSentT7) return MILESTONES[1];
  if (daysLeft <= 30 && !row.reminderSentT30) return MILESTONES[0];
  return null;
}

export type ReminderResult = {
  scanned: number;
  sent: number;
  skipped: number;
  errors: { id: string; error: string }[];
};

export async function runDeadlineReminders(
  recipients: string[]
): Promise<ReminderResult> {
  if (recipients.length === 0) {
    return { scanned: 0, sent: 0, skipped: 0, errors: [{ id: "config", error: "no recipients" }] };
  }

  const now = new Date();
  const todayISO = now.toISOString().slice(0, 10);
  const horizon = new Date(now.getTime() + 31 * 86_400_000)
    .toISOString()
    .slice(0, 10);

  // Pull every unpaid deadline within 31 days
  const rows = await db
    .select({
      id: taxDeadlines.id,
      kind: taxDeadlines.kind,
      dueDate: taxDeadlines.dueDate,
      notes: taxDeadlines.notes,
      entityId: taxDeadlines.entityId,
      reminderSentT30: taxDeadlines.reminderSentT30,
      reminderSentT7: taxDeadlines.reminderSentT7,
      reminderSentT1: taxDeadlines.reminderSentT1,
      entityName: entities.name,
    })
    .from(taxDeadlines)
    .leftJoin(entities, eq(entities.id, taxDeadlines.entityId))
    .where(
      and(
        ne(taxDeadlines.status, "paid"),
        gte(taxDeadlines.dueDate, todayISO),
        lte(taxDeadlines.dueDate, horizon)
      )!
    );

  const result: ReminderResult = {
    scanned: rows.length,
    sent: 0,
    skipped: 0,
    errors: [],
  };

  for (const r of rows) {
    const daysLeft = daysBetween(r.dueDate, now);
    const milestone = pickMilestone(daysLeft, {
      reminderSentT30: r.reminderSentT30,
      reminderSentT7: r.reminderSentT7,
      reminderSentT1: r.reminderSentT1,
    });
    if (!milestone) {
      result.skipped++;
      continue;
    }

    const label = KIND_LABEL[r.kind] ?? r.kind;
    const system = SYSTEM_FOR_KIND[r.kind];
    const entityHint = r.entityName ? ` · ${r.entityName}` : "";
    const subject = `[${milestone.subjectTag}] ${label} due ${r.dueDate}${entityHint}`;

    const lines: string[] = [];
    lines.push(`${label} is due ${r.dueDate} (in ${daysLeft} day${daysLeft === 1 ? "" : "s"}).`);
    if (r.entityName) lines.push(`Entity: ${r.entityName}`);
    if (system) lines.push(`File through: ${system}`);
    if (r.notes) lines.push(`Note: ${r.notes}`);
    lines.push("");
    lines.push("Mark paid: https://handsheldopen.com/deadlines");
    lines.push("");
    lines.push("— The Ledger");

    const text = lines.join("\n");
    const html = `
      <div style="font-family:Inter,system-ui,sans-serif;color:#0f172a;background:#faf8f4;padding:32px;">
        <div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid rgba(15,23,42,0.08);border-radius:16px;padding:28px;box-shadow:0 8px 24px rgba(15,23,42,0.06);">
          <div style="font-size:11px;font-weight:600;letter-spacing:0.18em;text-transform:uppercase;color:#c89d4a;margin-bottom:8px;">Cobb Family Legacy</div>
          <h1 style="font-family:'Playfair Display',Georgia,serif;font-size:24px;line-height:1.2;margin:0 0 12px 0;">${label} due ${r.dueDate}</h1>
          <p style="font-size:15px;line-height:1.5;color:#334155;margin:0 0 18px;">
            <strong>${daysLeft} day${daysLeft === 1 ? "" : "s"}</strong> until this filing.${r.entityName ? ` Filing for <strong>${r.entityName}</strong>.` : ""}
          </p>
          ${system ? `<p style="font-size:13px;color:#6b7280;margin:0 0 10px;">File through <strong>${system}</strong></p>` : ""}
          ${r.notes ? `<p style="font-size:13px;color:#6b7280;margin:0 0 18px;">${r.notes}</p>` : ""}
          <a href="https://handsheldopen.com/deadlines" style="display:inline-block;background:#0f172a;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:10px 20px;border-radius:9999px;">Mark paid on The Ledger</a>
          <p style="font-size:11px;color:#94a3b8;margin:24px 0 0;text-transform:uppercase;letter-spacing:0.14em;">The Ledger · ${milestone.subjectTag} reminder</p>
        </div>
      </div>
    `;

    try {
      await sendMail({ to: recipients, subject, text, html });
      // Stamp the milestone column
      await db
        .update(taxDeadlines)
        .set({
          ...(milestone.column === "t30" ? { reminderSentT30: now } : {}),
          ...(milestone.column === "t7" ? { reminderSentT7: now } : {}),
          ...(milestone.column === "t1" ? { reminderSentT1: now } : {}),
        })
        .where(eq(taxDeadlines.id, r.id));
      result.sent++;
    } catch (err) {
      result.errors.push({ id: r.id, error: String(err) });
    }
  }

  return result;
}

export async function getActiveUserEmails(): Promise<string[]> {
  const rows = await db.select({ email: users.email }).from(users);
  return rows
    .map((r) => r.email)
    .filter((e): e is string => typeof e === "string" && e.length > 0);
}
