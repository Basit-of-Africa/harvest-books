import "server-only";
import { and, eq, gte, lte, sql, type SQL } from "drizzle-orm";
import { db, schema } from "@/db";
import { ACC } from "./accounts";
import { r2, toNum } from "./format";

const n = (v: unknown) => r2(toNum(v));
function range(col: any, from?: string, to?: string): SQL[] {
  const w: SQL[] = [];
  if (from) w.push(gte(col, from));
  if (to) w.push(lte(col, to));
  return w;
}

/** Workbook-style totals for a period, read straight from the books (matches the Monthly Summary sheet). */
export async function bookTotals(businessId: string, from?: string, to?: string) {
  const T = schema;
  const one = async (q: Promise<{ v: string | null }[]>) => n((await q)[0]?.v);
  const [sales, salesVat, purchases, purchaseVat, cashIn, cashOut, payroll, petty] = await Promise.all([
    one(db.select({ v: sql<string>`sum(${T.sales.quantity} * ${T.sales.unitPrice})` }).from(T.sales).where(and(eq(T.sales.businessId, businessId), ...range(T.sales.date, from, to)))),
    one(db.select({ v: sql<string>`sum(${T.sales.vat})` }).from(T.sales).where(and(eq(T.sales.businessId, businessId), ...range(T.sales.date, from, to)))),
    one(db.select({ v: sql<string>`sum(${T.purchases.quantity} * ${T.purchases.unitCost})` }).from(T.purchases).where(and(eq(T.purchases.businessId, businessId), ...range(T.purchases.date, from, to)))),
    one(db.select({ v: sql<string>`sum(${T.purchases.vat})` }).from(T.purchases).where(and(eq(T.purchases.businessId, businessId), ...range(T.purchases.date, from, to)))),
    one(db.select({ v: sql<string>`sum(${T.cashEntries.moneyIn})` }).from(T.cashEntries).where(and(eq(T.cashEntries.businessId, businessId), ...range(T.cashEntries.date, from, to)))),
    one(db.select({ v: sql<string>`sum(${T.cashEntries.moneyOut})` }).from(T.cashEntries).where(and(eq(T.cashEntries.businessId, businessId), ...range(T.cashEntries.date, from, to)))),
    one(db.select({ v: sql<string>`sum(${T.payroll.daysWorked} * ${T.payroll.rate})` }).from(T.payroll).where(and(eq(T.payroll.businessId, businessId), ...range(T.payroll.date, from, to)))),
    one(db.select({ v: sql<string>`sum(${T.pettyCash.amountOut})` }).from(T.pettyCash).where(and(eq(T.pettyCash.businessId, businessId), ...range(T.pettyCash.date, from, to)))),
  ]);
  return { sales, salesVat, purchases, purchaseVat, cashIn, cashOut, payroll, petty, netCash: r2(cashIn - cashOut), grossMargin: r2(sales - purchases) };
}

/** Balance per account from the journal, for a date range (or up to a date when only `to` is given). */
export async function accountBalances(businessId: string, from?: string, to?: string) {
  const T = schema;
  const rows = await db.select({
    id: T.accounts.id, code: T.accounts.code, name: T.accounts.name, type: T.accounts.type,
    debit: sql<string>`coalesce(sum(${T.journalLines.debit}) filter (where ${T.journalEntries.id} is not null),0)`,
    credit: sql<string>`coalesce(sum(${T.journalLines.credit}) filter (where ${T.journalEntries.id} is not null),0)`,
  }).from(T.accounts)
    .leftJoin(T.journalLines, eq(T.journalLines.accountId, T.accounts.id))
    .leftJoin(T.journalEntries, and(eq(T.journalEntries.id, T.journalLines.entryId), ...range(T.journalEntries.date, from, to)))
    .where(eq(T.accounts.businessId, businessId))
    .groupBy(T.accounts.id).orderBy(T.accounts.code);
  return rows.map((r) => {
    const debit = n(r.debit), credit = n(r.credit);
    const natural = r.type === "asset" || r.type === "expense" ? r2(debit - credit) : r2(credit - debit);
    return { ...r, debit, credit, balance: natural };
  });
}

export async function journalSummary(businessId: string, from?: string, to?: string) {
  const period = await accountBalances(businessId, from, to);
  const asAt = await accountBalances(businessId, undefined, to);
  const by = (rows: typeof period, code: string) => rows.find((r) => r.code === code)?.balance ?? 0;
  const income = r2(period.filter((r) => r.type === "income").reduce((s, r) => s + r.balance, 0));
  const expenses = r2(period.filter((r) => r.type === "expense").reduce((s, r) => s + r.balance, 0));
  return {
    income, expenses, profit: r2(income - expenses),
    outputVat: by(period, ACC.outputVat), inputVat: by(period, ACC.inputVat),
    cash: by(asAt, ACC.cash), petty: by(asAt, ACC.petty),
    receivable: by(asAt, ACC.receivable), payable: by(asAt, ACC.payable),
  };
}

export async function monthlyCash(businessId: string, year: string) {
  const T = schema;
  const rows = await db.select({
    m: sql<number>`extract(month from ${T.cashEntries.date})::int`,
    inn: sql<string>`sum(${T.cashEntries.moneyIn})`, out: sql<string>`sum(${T.cashEntries.moneyOut})`,
  }).from(T.cashEntries).where(and(eq(T.cashEntries.businessId, businessId), gte(T.cashEntries.date, `${year}-01-01`), lte(T.cashEntries.date, `${year}-12-31`)))
    .groupBy(sql`1`);
  const ins = Array(12).fill(0), outs = Array(12).fill(0);
  rows.forEach((r) => { ins[r.m - 1] = n(r.inn); outs[r.m - 1] = n(r.out); });
  return { ins, outs };
}
