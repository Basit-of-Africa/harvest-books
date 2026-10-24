import { NextResponse } from "next/server";
import { requireBusiness } from "@/lib/auth";
import { BOOKS, isBook } from "@/lib/books";
import { loadBook } from "@/lib/book-data";
import { todayISO } from "@/lib/format";

const cell = (v: unknown) => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

export async function GET(_req: Request, { params }: { params: Promise<{ book: string }> }) {
  const { book } = await params;
  if (!isBook(book)) return new NextResponse("Not found", { status: 404 });
  const ctx = await requireBusiness();
  const { rows } = await loadBook(book, ctx.business);
  const cols = BOOKS[book].columns;
  const csv = [cols.map((c) => cell(c.label)).join(","), ...rows.map((r) => cols.map((c) => cell(r[c.key])).join(","))].join("\n");
  return new NextResponse("﻿" + csv, {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${book}-${todayISO()}.csv"` },
  });
}
