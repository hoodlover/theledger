import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";

async function clearAndRedirect(req: NextRequest): Promise<Response> {
  (await cookies()).delete(SESSION_COOKIE);
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const GET = clearAndRedirect;
export const POST = clearAndRedirect;
