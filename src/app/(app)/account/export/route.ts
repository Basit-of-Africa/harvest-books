import { NextResponse } from "next/server";
import { getCtx } from "@/lib/auth";
import { exportPersonalData } from "@/lib/privacy";
import { audit } from "@/lib/security";
import { todayISO } from "@/lib/format";

/** Download my data: everything held about the signed-in person, as JSON. */
export async function GET() {
  const ctx = await getCtx();
  if (!ctx) return new NextResponse("Sign in first.", { status: 401 });
  const data = await exportPersonalData(ctx.user.id);
  await audit({ action: "data.export_account", userId: ctx.user.id });
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: { "content-type": "application/json; charset=utf-8", "content-disposition": `attachment; filename="farmtrace-my-data-${todayISO()}.json"`, "cache-control": "private, no-store" },
  });
}
