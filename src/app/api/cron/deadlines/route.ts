import { NextRequest } from "next/server";
import { runDeadlineReminders, getActiveUserEmails } from "@/lib/reminders";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  // Vercel cron sends `Authorization: Bearer <CRON_SECRET>`. Manual triggers
  // can pass ?key=... in the query string.
  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true;
  const key = req.nextUrl.searchParams.get("key");
  if (key === secret) return true;
  return false;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return new Response("unauthorized", { status: 401 });
  }
  const recipients = await getActiveUserEmails();
  const result = await runDeadlineReminders(recipients);
  await logAudit({
    eventKind: "cron.deadlines",
    summary: `Deadline reminders: ${result.sent} sent, ${result.skipped} skipped, ${result.scanned} scanned`,
    meta: { ...result, recipientCount: recipients.length },
  });
  return Response.json(result);
}

export { GET as POST };
