import { NextResponse } from "next/server";
import { requireBusiness } from "@/lib/auth";
import { BOOKS, isBook } from "@/lib/books";
import { loadBook } from "@/lib/book-data";
import { todayISO } from "@/lib/format";
import { audit } from "@/lib/security";
import { csvCell } from "@/lib/csv";

export async function GET(_req: Request, { params }: { params: Promise<{ book: string }> }) {
  const { book } = await params;
  if (!isBook(book)) return new NextResponse("Not found", { status: 404 });
  const ctx = await requireBusiness();
  const { rows } = await loadBook(book, ctx.business);
  const cols = BOOKS[book].columns;
  await audit({ action: "data.export_book", userId: ctx.user.id, businessId: ctx.business.id, target: book, meta: { rows: rows.length } });
  const csv = [cols.map((c) => csvCell(c.label)).join(","), ...rows.map((r) => cols.map((c) => csvCell(r[c.key])).join(","))].join("\n");
  return new NextResponse("﻿" + csv, {
    headers: { "content-type": "text/csv; charset=utf-8", "cache-control": "private, no-store", "content-disposition": `attachment; filename="${book}-${todayISO()}.csv"` },
  });
}
