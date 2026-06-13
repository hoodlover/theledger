import nodemailer, { type Transporter } from "nodemailer";

let cached: Transporter | null = null;

function buildTransport(): Transporter {
  const host = process.env.ZOHO_SMTP_HOST;
  const port = Number(process.env.ZOHO_SMTP_PORT ?? "465");
  const user = process.env.ZOHO_SMTP_USER;
  const pass = process.env.ZOHO_SMTP_PASS;
  if (!host || !user || !pass) {
    throw new Error(
      "Zoho SMTP not configured — set ZOHO_SMTP_HOST / USER / PASS in env."
    );
  }
  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // SSL on 465, STARTTLS on 587
    auth: { user, pass },
  });
}

export function getMailer(): Transporter {
  if (!cached) cached = buildTransport();
  return cached;
}

export function getFromAddress(): string {
  return (
    process.env.ZOHO_SMTP_FROM ??
    process.env.ZOHO_SMTP_USER ??
    "noreply@example.com"
  );
}

export type SendInput = {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
};

export async function sendMail(input: SendInput) {
  const transporter = getMailer();
  await transporter.sendMail({
    from: getFromAddress(),
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html,
    replyTo: input.replyTo,
  });
}
