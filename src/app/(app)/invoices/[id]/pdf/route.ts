import { NextResponse } from "next/server";
import { requireBusiness } from "@/lib/auth";
import { getInvoice } from "@/lib/invoices";
import { invoicePdf } from "@/lib/pdf";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireBusiness();
  const inv = await getInvoice(ctx.business.id, id);
  if (!inv) return new NextResponse("Not found", { status: 404 });
  const pdf = await invoicePdf(ctx.business, inv);
  const inline = new URL(req.url).searchParams.has("view");
  return new NextResponse(Buffer.from(pdf), {
    headers: { "content-type": "application/pdf", "content-disposition": `${inline ? "inline" : "attachment"}; filename="${inv.number}.pdf"` },
  });
}
