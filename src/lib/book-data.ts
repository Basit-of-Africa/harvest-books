import "server-only";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { BOOKS, computeRows, type BookKey } from "./books";

/** All rows of a book in ledger order, with computed columns and account names. */
export async function loadBook(book: BookKey, business: typeof schema.businesses.$inferSelect) {
  const def = BOOKS[book];
  const t = def.table as any;
  const sortCol = def.sortKey ? t[def.sortKey] : t.date;
  const rows = await db.select().from(t).where(eq(t.businessId, business.id)).orderBy(asc(sortCol), asc(t.createdAt));
  const accs = await db.select().from(schema.accounts).where(eq(schema.accounts.businessId, business.id)).orderBy(asc(schema.accounts.code));
  const names = Object.fromEntries(accs.map((a) => [a.id, a.name]));
  const computed = computeRows(book, rows as any[], { cashOpening: business.cashOpening, pettyFloat: business.pettyFloat })
    .map((r: any) => ({ ...r, account: r.accountId ? names[r.accountId] ?? "" : "" }));
  return { rows: computed as Record<string, any>[], accounts: accs };
}
