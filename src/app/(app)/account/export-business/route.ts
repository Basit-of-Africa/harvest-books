import { NextResponse } from "next/server";
import { getCtx, can } from "@/lib/auth";
import { exportBusinessData } from "@/lib/privacy";
import { audit } from "@/lib/security";
import { todayISO } from "@/lib/format";

/** Full archive of the active business's books and invoices, for its owner. NRS secrets are never included. */
export async function GET() {
  const ctx = await getCtx();
  if (!ctx) return new NextResponse("Sign in first.", { status: 401 });
  if (!ctx.business || !can(ctx.role, "owner")) return new NextResponse("Only the business owner can download the full archive.", { status: 403 });
  const data = await exportBusinessData(ctx.business.id);
  await audit({ action: "data.export_business", userId: ctx.user.id, businessId: ctx.business.id });
  const slug = ctx.business.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "business";
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: { "content-type": "application/json; charset=utf-8", "content-disposition": `attachment; filename="farmtrace-${slug}-${todayISO()}.json"`, "cache-control": "private, no-store" },
  });
}
