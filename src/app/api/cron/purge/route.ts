import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { purgeExpired } from "@/lib/privacy";

/** Daily retention clean-up. Vercel Cron calls this with `Authorization: Bearer $CRON_SECRET` (see vercel.json). */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const got = req.headers.get("authorization") ?? "";
  const want = `Bearer ${secret}`;
  if (!secret || got.length !== want.length || !timingSafeEqual(Buffer.from(got), Buffer.from(want))) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  const removed = await purgeExpired();
  return NextResponse.json({ ok: true, removed });
}
