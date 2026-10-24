/**
 * Double-entry posting. Every book record is a "source" that owns its journal entry and any rows it
 * generates in other books (a cash sale owns a cash book line; a credit purchase owns a creditor).
 * Posting is idempotent: re-posting a source deletes what it owned and writes it again.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { schema, type DB, type Tx } from "@/db";
import { ACC, accountIds } from "./accounts";
import { depreciation } from "./books";
import { r2, toNum, todayISO } from "./format";

type Conn = DB | Tx;
type JLine = { code?: string; accountId?: string | null; debit?: number; credit?: number };

/** Cash lines whose journal is written by another source; these are skipped when posting the cash book itself. */
export const GENERATED_CASH = ["sale", "purchase", "payroll", "petty", "asset"] as const;

export async function writeJournal(tx: Conn, businessId: string, sourceType: string, sourceId: string, date: string, memo: string, lines: JLine[]) {
  await tx.delete(schema.journalEntries).where(and(
    eq(schema.journalEntries.businessId, businessId), eq(schema.journalEntries.sourceType, sourceType), eq(schema.journalEntries.sourceId, sourceId)));
  const ids = await accountIds(tx, businessId);
  const clean = lines
    .map((l) => ({ accountId: l.accountId || (l.code ? ids[l.code] : undefined), debit: r2(toNum(l.debit)), credit: r2(toNum(l.credit)) }))
    .filter((l) => l.accountId && (l.debit || l.credit));
  if (!clean.length) return;
  const dr = r2(clean.reduce((s, l) => s + l.debit, 0)), cr = r2(clean.reduce((s, l) => s + l.credit, 0));
  if (dr !== cr) throw new Error(`Journal for ${sourceType} does not balance (${dr} vs ${cr}).`);
  const [e] = await tx.insert(schema.journalEntries).values({ businessId, date, memo, sourceType, sourceId }).returning({ id: schema.journalEntries.id });
  await tx.insert(schema.journalLines).values(clean.map((l) => ({ entryId: e.id, accountId: l.accountId!, debit: l.debit, credit: l.credit })));
}

async function clearGenerated(tx: Conn, businessId: string, sourceType: string, sourceId: string, keepParty = false) {
  await tx.delete(schema.cashEntries).where(and(eq(schema.cashEntries.businessId, businessId), eq(schema.cashEntries.sourceType, sourceType), eq(schema.cashEntries.sourceId, sourceId)));
  if (!keepParty) await tx.delete(schema.parties).where(and(eq(schema.parties.businessId, businessId), eq(schema.parties.sourceType, sourceType), eq(schema.parties.sourceId, sourceId)));
}

async function linkedCash(tx: Conn, businessId: string, sourceType: string, sourceId: string, v: { date: string; description: string; ref?: string; moneyIn?: number; moneyOut?: number; example?: boolean }) {
  await tx.insert(schema.cashEntries).values({ businessId, sourceType, sourceId, date: v.date, description: v.description, ref: v.ref ?? "", moneyIn: r2(toNum(v.moneyIn)), moneyOut: r2(toNum(v.moneyOut)), example: !!v.example });
}

/** Keeps a generated debtor/creditor in step with its source, preserving payments already recorded against it. */
async function upsertLinkedParty(tx: Conn, businessId: string, sourceType: string, sourceId: string, v: { kind: string; name: string; description: string; amount: number; date: string; dueDate: string | null; example?: boolean }) {
  const [existing] = await tx.select().from(schema.parties).where(and(eq(schema.parties.businessId, businessId), eq(schema.parties.sourceType, sourceType), eq(schema.parties.sourceId, sourceId))).limit(1);
  if (existing) {
    await tx.update(schema.parties).set({ kind: v.kind, name: v.name, description: v.description, amount: r2(v.amount), date: v.date, dueDate: v.dueDate }).where(eq(schema.parties.id, existing.id));
    return existing.id;
  }
  const [p] = await tx.insert(schema.parties).values({ businessId, sourceType, sourceId, ...v, amount: r2(v.amount), example: !!v.example }).returning({ id: schema.parties.id });
  return p.id;
}

/** Post one book record. Call inside the same transaction that saved it. */
export async function postBookRecord(tx: Conn, businessId: string, book: string, r: Record<string, any>) {
  const id: string = r.id, date: string = r.date, ex = !!r.example;
  switch (book) {
    case "cash": {
      if (r.sourceType && (GENERATED_CASH as readonly string[]).includes(r.sourceType)) return;
      const inn = toNum(r.moneyIn), out = toNum(r.moneyOut);
      const other = r.accountId ? { accountId: r.accountId } : { code: inn > 0 ? ACC.otherIncome : ACC.general };
      await writeJournal(tx, businessId, "cash", id, date, r.description, [
        { code: ACC.cash, debit: inn, credit: out },
        { ...other, debit: out, credit: inn },
      ]);
      if (r.sourceType === "party_payment" && r.sourceId) await refreshParty(tx, businessId, r.sourceId);
      return;
    }
    case "sales": {
      await clearGenerated(tx, businessId, "sale", id, true);
      if (r.invoiceId) { await writeJournal(tx, businessId, "sale", id, date, "", []); return; } // the invoice carries the journal
      const amt = r2(toNum(r.quantity) * toNum(r.unitPrice)), vat = r2(toNum(r.vat)), gross = r2(amt + vat);
      const credit = r.paymentStatus === "Credit";
      await writeJournal(tx, businessId, "sale", id, date, `Sale to ${r.customer}`, [
        { code: credit ? ACC.receivable : ACC.cash, debit: gross },
        { code: ACC.sales, credit: amt }, { code: ACC.outputVat, credit: vat },
      ]);
      if (credit) await upsertLinkedParty(tx, businessId, "sale", id, { kind: "Debtor", name: r.customer, description: `${r.product} on credit`, amount: gross, date, dueDate: null, example: ex });
      else {
        await tx.delete(schema.parties).where(and(eq(schema.parties.businessId, businessId), eq(schema.parties.sourceType, "sale"), eq(schema.parties.sourceId, id)));
        await linkedCash(tx, businessId, "sale", id, { date, description: `Sale: ${r.product} to ${r.customer}`, moneyIn: gross, example: ex });
      }
      return;
    }
    case "purchases": {
      await clearGenerated(tx, businessId, "purchase", id, true);
      const amt = r2(toNum(r.quantity) * toNum(r.unitCost)), vat = r2(toNum(r.vat)), gross = r2(amt + vat);
      const credit = r.paymentStatus === "Credit";
      await writeJournal(tx, businessId, "purchase", id, date, `Purchase from ${r.supplier}`, [
        { code: ACC.purchases, debit: amt }, { code: ACC.inputVat, debit: vat },
        { code: credit ? ACC.payable : ACC.cash, credit: gross },
      ]);
      if (credit) await upsertLinkedParty(tx, businessId, "purchase", id, { kind: "Creditor", name: r.supplier, description: `${r.item} on credit`, amount: gross, date, dueDate: null, example: ex });
      else {
        await tx.delete(schema.parties).where(and(eq(schema.parties.businessId, businessId), eq(schema.parties.sourceType, "purchase"), eq(schema.parties.sourceId, id)));
        await linkedCash(tx, businessId, "purchase", id, { date, description: `Purchase: ${r.item} from ${r.supplier}`, moneyOut: gross, example: ex });
      }
      return;
    }
    case "petty": {
      await clearGenerated(tx, businessId, "petty", id);
      const top = toNum(r.topUp), out = toNum(r.amountOut);
      await writeJournal(tx, businessId, "petty", id, date, r.description, [
        { code: ACC.petty, debit: top, credit: out },
        { code: ACC.cash, credit: top },
        r.accountId ? { accountId: r.accountId, debit: out } : { code: ACC.general, debit: out },
      ]);
      if (top > 0) await linkedCash(tx, businessId, "petty", id, { date, description: "Petty cash top-up", ref: r.voucher, moneyOut: top, example: ex });
      return;
    }
    case "payroll": {
      await clearGenerated(tx, businessId, "payroll", id);
      const amt = r2(toNum(r.daysWorked) * toNum(r.rate));
      await writeJournal(tx, businessId, "payroll", id, date, `Wages: ${r.staffName}`, [{ code: ACC.wages, debit: amt }, { code: ACC.cash, credit: amt }]);
      await linkedCash(tx, businessId, "payroll", id, { date, description: `Wages: ${r.staffName}`, moneyOut: amt, example: ex });
      return;
    }
    case "assets": {
      await clearGenerated(tx, businessId, "asset", id);
      const cost = toNum(r.cost);
      await writeJournal(tx, businessId, "asset", id, date, `Asset: ${r.name}`, [
        { code: ACC.fixedAssets, debit: cost }, { code: r.paidFromCash ? ACC.cash : ACC.equity, credit: cost },
      ]);
      if (r.paidFromCash) await linkedCash(tx, businessId, "asset", id, { date, description: `Asset bought: ${r.name}`, moneyOut: cost, example: ex });
      return;
    }
    case "parties": {
      if (r.sourceType) return; // generated by a sale, purchase or invoice, which carries the journal
      const amt = toNum(r.amount), debtor = r.kind === "Debtor";
      const other = r.accountId ? { accountId: r.accountId } : { code: ACC.equity };
      await writeJournal(tx, businessId, "party", id, date, `${r.kind}: ${r.name}`, debtor
        ? [{ code: ACC.receivable, debit: amt }, { ...other, credit: amt }]
        : [{ ...other, debit: amt }, { code: ACC.payable, credit: amt }]);
      return;
    }
  }
}

/** Remove a record's journal and everything it generated. */
export async function unpostBookRecord(tx: Conn, businessId: string, book: string, id: string) {
  const st: Record<string, string> = { cash: "cash", sales: "sale", purchases: "purchase", petty: "petty", payroll: "payroll", assets: "asset", parties: "party" };
  if (st[book]) {
    await tx.delete(schema.journalEntries).where(and(eq(schema.journalEntries.businessId, businessId), eq(schema.journalEntries.sourceType, st[book]), eq(schema.journalEntries.sourceId, id)));
    await clearGenerated(tx, businessId, st[book], id);
  }
  if (book === "assets") await tx.delete(schema.journalEntries).where(and(eq(schema.journalEntries.businessId, businessId), eq(schema.journalEntries.sourceType, "depreciation"), eq(schema.journalEntries.sourceId, id)));
}

/** Recalculate what has been paid against a debtor or creditor, and mirror it onto a linked invoice. */
export async function refreshParty(tx: Conn, businessId: string, partyId: string) {
  const [p] = await tx.select().from(schema.parties).where(and(eq(schema.parties.id, partyId), eq(schema.parties.businessId, businessId))).limit(1);
  if (!p) return;
  const [s] = await tx.select({ paid: sql<string>`coalesce(sum(${schema.cashEntries.moneyIn} + ${schema.cashEntries.moneyOut}),0)` })
    .from(schema.cashEntries).where(and(eq(schema.cashEntries.businessId, businessId), eq(schema.cashEntries.sourceType, "party_payment"), eq(schema.cashEntries.sourceId, partyId)));
  const paid = r2(toNum(s.paid));
  await tx.update(schema.parties).set({ paid }).where(eq(schema.parties.id, partyId));
  if (p.sourceType === "invoice" && p.sourceId) {
    const status = paid <= 0 ? "PENDING" : paid >= toNum(p.amount) ? "PAID" : "PARTIAL";
    await tx.update(schema.invoices).set({ amountPaid: paid, paymentStatus: status, updatedAt: new Date() }).where(and(eq(schema.invoices.id, p.sourceId), eq(schema.invoices.businessId, businessId)));
  }
}

/** Record money received from a debtor or paid to a creditor: a cash book line posted against receivables or payables. */
export async function recordPartyPayment(tx: Conn, businessId: string, partyId: string, amount: number, date: string, ref: string, userId?: string) {
  const [p] = await tx.select().from(schema.parties).where(and(eq(schema.parties.id, partyId), eq(schema.parties.businessId, businessId))).limit(1);
  if (!p) throw new Error("That debtor or creditor no longer exists.");
  if (!(amount > 0)) throw new Error("Enter an amount above zero.");
  const ids = await accountIds(tx, businessId);
  const debtor = p.kind === "Debtor";
  const [c] = await tx.insert(schema.cashEntries).values({
    businessId, sourceType: "party_payment", sourceId: p.id, date, ref,
    description: debtor ? `Payment from ${p.name}` : `Payment to ${p.name}`,
    moneyIn: debtor ? r2(amount) : 0, moneyOut: debtor ? 0 : r2(amount),
    accountId: ids[debtor ? ACC.receivable : ACC.payable], createdBy: userId,
  }).returning();
  await postBookRecord(tx, businessId, "cash", c);
}

/** Opening balances from settings: cash at bank and petty cash float, against owner's capital. */
export async function postOpening(tx: Conn, business: { id: string; cashOpening: number; pettyFloat: number; cashOpeningDate: string | null; createdAt: Date }) {
  const date = business.cashOpeningDate ?? business.createdAt.toISOString().slice(0, 10);
  await writeJournal(tx, business.id, "opening", "cash", date, "Opening cash balance", [{ code: ACC.cash, debit: business.cashOpening }, { code: ACC.equity, credit: business.cashOpening }]);
  await writeJournal(tx, business.id, "opening", "petty", date, "Petty cash float", [{ code: ACC.petty, debit: business.pettyFloat }, { code: ACC.equity, credit: business.pettyFloat }]);
}

/** Post straight-line depreciation for every asset up to a date. Replaces earlier depreciation postings. */
export async function postDepreciation(tx: Conn, businessId: string, asOf = todayISO()) {
  const rows = await tx.select().from(schema.assets).where(eq(schema.assets.businessId, businessId));
  let total = 0;
  for (const a of rows) {
    const { accDep } = depreciation(a.cost, a.lifeYears, a.date, asOf);
    total += accDep;
    await writeJournal(tx, businessId, "depreciation", a.id, asOf, `Depreciation to ${asOf}: ${a.name}`, [{ code: ACC.depreciation, debit: accDep }, { code: ACC.accDep, credit: accDep }]);
  }
  return r2(total);
}

export async function removeInvoicePosting(tx: Conn, businessId: string, invoiceId: string) {
  await tx.delete(schema.journalEntries).where(and(eq(schema.journalEntries.businessId, businessId), eq(schema.journalEntries.sourceType, "invoice"), eq(schema.journalEntries.sourceId, invoiceId)));
  const saleRows = await tx.select({ id: schema.sales.id }).from(schema.sales).where(and(eq(schema.sales.businessId, businessId), eq(schema.sales.invoiceId, invoiceId)));
  if (saleRows.length) await tx.delete(schema.sales).where(inArray(schema.sales.id, saleRows.map((s) => s.id)));
}
