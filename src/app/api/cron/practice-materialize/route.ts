import { NextRequest } from "next/server";
import { materializeStandingSessions } from "@/app/(app)/practice/_crm-actions";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

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
  const result = await materializeStandingSessions(6);
  await logAudit({
    eventKind: "cron.practice_materialize",
    summary: `Materialized ${result.scheduled} standing-schedule sessions (${result.skipped} already existed)`,
    meta: result,
  });
  return Response.json(result);
}

export { GET as POST };
