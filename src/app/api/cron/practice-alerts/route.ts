import { NextRequest } from "next/server";
import { runPracticeAlerts } from "@/app/(app)/practice/_crm-actions";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
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
  const result = await runPracticeAlerts();
  await logAudit({
    eventKind: "cron.practice_alerts",
    summary: `Practice alerts: ${result.pushed} notification${result.pushed === 1 ? "" : "s"} pushed`,
    meta: result,
  });
  return Response.json(result);
}

export { GET as POST };
