import "server-only";
import { and, eq, like, sql } from "drizzle-orm";
import { db, schema, type Tx } from "@/db";
import type { InvoiceLine, PartySnapshot } from "@/db/schema";
import { ACC } from "./accounts";
import { r2, toNum, todayISO } from "./format";
import { buildPayload, calcInvoice, validateInvoice, type InvoiceDraft, type SupplierProfile } from "./nrs/core";
import { getProvider, redact, type CallResult } from "./nrs/providers";
import { recordPartyPayment, refreshParty, removeInvoicePosting, writeJournal } from "./posting";

type Business = typeof schema.businesses.$inferSelect;
type Invoice = typeof schema.invoices.$inferSelect;

export function supplierProfile(b: Business): SupplierProfile {
  return {
    name: b.name, tin: b.tin, email: b.email, phone: b.phone, street: b.street, city: b.city, postalCode: b.postalCode,
    country: b.country, description: b.description, nrsBusinessId: b.nrsBusinessId, nrsServiceId: b.nrsServiceId,
    vatRate: b.vatRate, codeInvoice: b.codeInvoice, codeCredit: b.codeCredit, codeDebit: b.codeDebit,
  };
}

export function toDraft(i: Invoice): InvoiceDraft {
  return {
    kind: i.kind, transactionType: i.transactionType, number: i.number, issueDate: i.issueDate, issueTime: i.issueTime,
    dueDate: i.dueDate, paymentMeans: i.paymentMeans, paymentStatus: i.paymentStatus, customer: i.customer, lines: i.lines,
    note: i.note, refIrn: i.refIrn, refDate: i.refDate, irn: i.irn || undefined,
  };
}

export const isLocked = (i: Pick<Invoice, "nrsStatus">) => i.nrsStatus === "signed" || i.nrsStatus === "transmitted";

export async function nextNumber(b: Business, kind: string) {
  const prefix = (kind === "credit" ? b.crnPrefix : kind === "debit" ? b.dbnPrefix : b.invPrefix) || "INV";
  const rows = await db.select({ n: schema.invoices.number }).from(schema.invoices)
    .where(and(eq(schema.invoices.businessId, b.id), like(schema.invoices.number, `${prefix}%`)));
  const max = rows.reduce((m, r) => Math.max(m, parseInt(r.n.slice(prefix.length), 10) || 0), 0);
  return prefix + String(max + 1).padStart(4, "0");
}

export async function getInvoice(businessId: string, id: string) {
  const [i] = await db.select().from(schema.invoices).where(and(eq(schema.invoices.id, id), eq(schema.invoices.businessId, businessId))).limit(1);
  return i ?? null;
}

/** Save a draft (new or edited). Remembers the customer and items for next time. */
export async function saveInvoice(b: Business, userId: string, d: InvoiceDraft, id?: string) {
  const t = calcInvoice(d.lines, b.vatRate);
  return db.transaction(async (tx) => {
    if (id) {
      const [cur] = await tx.select().from(schema.invoices).where(and(eq(schema.invoices.id, id), eq(schema.invoices.businessId, b.id))).limit(1);
      if (!cur) throw new Error("That invoice no longer exists.");
      if (isLocked(cur)) throw new Error("A signed invoice cannot be changed. Issue a credit note instead.");
    }
    const [dupe] = await tx.select({ id: schema.invoices.id }).from(schema.invoices)
      .where(and(eq(schema.invoices.businessId, b.id), eq(schema.invoices.number, d.number))).limit(1);
    if (dupe && dupe.id !== id) throw new Error(`Invoice number ${d.number} is already used. Each number must be unique.`);
    const customerId = await rememberCustomer(tx, b.id, d.customer);
    await rememberItems(tx, b.id, d.lines);
    const values = {
      kind: d.kind, transactionType: d.transactionType, number: d.number, issueDate: d.issueDate, issueTime: d.issueTime,
      dueDate: d.dueDate || null, paymentMeans: d.paymentMeans, paymentStatus: d.paymentStatus, customerId,
      customer: d.customer, lines: d.lines, note: d.note, refIrn: d.refIrn, refDate: d.refDate || null,
      subtotal: t.subtotal, taxTotal: t.tax, total: t.total, irn: "", nrsStatus: "draft", nrsErrors: [], updatedAt: new Date(),
    };
    if (id) { await tx.update(schema.invoices).set(values).where(eq(schema.invoices.id, id)); return id; }
    const [row] = await tx.insert(schema.invoices).values({ ...values, businessId: b.id, createdBy: userId }).returning({ id: schema.invoices.id });
    return row.id;
  });
}

async function rememberCustomer(tx: Tx, businessId: string, c: PartySnapshot) {
  if (!c.name) return null;
  const v = { tin: c.tin, email: c.email, phone: c.phone, street: c.street, city: c.city, postalCode: c.postalCode, country: c.country || "NG" };
  const [row] = await tx.insert(schema.customers).values({ businessId, name: c.name, ...v })
    .onConflictDoUpdate({ target: [schema.customers.businessId, schema.customers.name], set: v }).returning({ id: schema.customers.id });
  return row.id;
}
async function rememberItems(tx: Tx, businessId: string, lines: InvoiceLine[]) {
  for (const l of lines) {
    if (!l.name) continue;
    const v = { description: l.description, hsCode: l.hsCode, category: l.category, unit: l.unit, price: toNum(l.price), taxCategory: l.taxCategory };
    await tx.insert(schema.items).values({ businessId, name: l.name, ...v }).onConflictDoUpdate({ target: [schema.items.businessId, schema.items.name], set: v });
  }
}

async function log(b: Business, invoiceId: string | null, provider: string, action: string, r: CallResult, started: number) {
  await db.insert(schema.nrsLogs).values({
    businessId: b.id, invoiceId, provider, action, ok: r.ok, httpStatus: r.status ?? null,
    request: redact(r.request ?? null), response: redact(r.response ?? (r.errors ? { errors: r.errors } : null)), durationMs: Date.now() - started,
  });
}

export type NrsOutcome = { ok: boolean; message: string; errors?: string[] };

/** Local checks, then IRN and invoice validation with the business's NRS provider. */
export async function validateWithNrs(b: Business, inv: Invoice): Promise<NrsOutcome> {
  if (isLocked(inv)) return { ok: false, message: "This invoice is already signed." };
  const draft = toDraft(inv);
  const v = validateInvoice(draft, supplierProfile(b));
  if (v.errors.length) {
    await db.update(schema.invoices).set({ nrsStatus: "draft", nrsErrors: v.errors.map((e) => e.message), updatedAt: new Date() }).where(eq(schema.invoices.id, inv.id));
    return { ok: false, message: `${v.errors.length} thing${v.errors.length > 1 ? "s" : ""} to fix before NRS will accept this invoice.`, errors: v.errors.map((e) => e.message) };
  }
  const p = getProvider(b.nrsProvider, b.nrsCredentials);
  const payload = buildPayload({ ...draft, irn: v.irn }, supplierProfile(b));
  let t = Date.now();
  const irnRes = await p.validateIrn(v.irn, inv.number, b.nrsBusinessId);
  await log(b, inv.id, p.id, "validate_irn", irnRes, t);
  if (!irnRes.ok) return fail(inv.id, "NRS did not accept the IRN.", irnRes.errors);
  t = Date.now();
  const res = await p.validateInvoice(payload);
  await log(b, inv.id, p.id, "validate_invoice", res, t);
  if (!res.ok) return fail(inv.id, "NRS rejected the invoice during validation.", res.errors);
  await db.update(schema.invoices).set({ irn: v.irn, nrsStatus: "validated", nrsProvider: p.id, nrsErrors: v.warnings, updatedAt: new Date() }).where(eq(schema.invoices.id, inv.id));
  return { ok: true, message: `Validated by ${p.label}. IRN ${v.irn}.` };
}

async function fail(id: string, message: string, errors?: string[]): Promise<NrsOutcome> {
  await db.update(schema.invoices).set({ nrsStatus: "failed", nrsErrors: errors ?? [], updatedAt: new Date() }).where(eq(schema.invoices.id, id));
  return { ok: false, message, errors };
}

export async function signWithNrs(b: Business, inv: Invoice): Promise<NrsOutcome> {
  if (inv.nrsStatus !== "validated") return { ok: false, message: "Validate the invoice before signing it." };
  const p = getProvider(b.nrsProvider, b.nrsCredentials);
  const payload = buildPayload(toDraft(inv), supplierProfile(b));
  const t = Date.now();
  const res = await p.signInvoice(payload);
  await log(b, inv.id, p.id, "sign_invoice", res, t);
  if (!res.ok || !res.data) return fail(inv.id, "NRS did not sign the invoice.", res.errors);
  await db.update(schema.invoices).set({
    nrsStatus: "signed", nrsCsid: res.data.csid, nrsQr: res.data.qr, nrsSignedAt: new Date(res.data.signedAt),
    nrsSimulated: !!res.data.simulated, nrsProvider: p.id, nrsErrors: [], updatedAt: new Date(),
  }).where(eq(schema.invoices.id, inv.id));
  return { ok: true, message: res.data.simulated ? "Signed in the sandbox. This signature is not valid for tax." : "Signed by NRS." };
}

/** For APPs used through their own dashboard: record the CSID and QR they returned. */
export async function recordSignature(b: Business, inv: Invoice, csid: string, qr: string, signedOn: string): Promise<NrsOutcome> {
  if (inv.nrsStatus !== "validated") return { ok: false, message: "Validate the invoice before recording a signature." };
  if (!csid || !qr) return { ok: false, message: "Add both the CSID and the QR code data." };
  await db.update(schema.invoices).set({ nrsStatus: "signed", nrsCsid: csid, nrsQr: qr, nrsSignedAt: new Date(signedOn || todayISO()), nrsSimulated: false, nrsProvider: "manual", nrsErrors: [], updatedAt: new Date() }).where(eq(schema.invoices.id, inv.id));
  await db.insert(schema.nrsLogs).values({ businessId: b.id, invoiceId: inv.id, provider: "manual", action: "record_signature", ok: true, request: { csid }, response: null });
  return { ok: true, message: "Signature recorded." };
}

export async function transmitWithNrs(b: Business, inv: Invoice): Promise<NrsOutcome> {
  if (inv.nrsStatus !== "signed") return { ok: false, message: "Only a signed invoice can be transmitted." };
  if (inv.nrsProvider !== "manual") {
    const p = getProvider(b.nrsProvider, b.nrsCredentials);
    const t = Date.now();
    const res = await p.transmit(inv.irn);
    await log(b, inv.id, p.id, "transmit", res, t);
    if (!res.ok) return { ok: false, message: "Transmission failed. The invoice stays signed; try again.", errors: res.errors };
  }
  await db.update(schema.invoices).set({ nrsStatus: "transmitted", nrsTransmittedAt: new Date(), updatedAt: new Date() }).where(eq(schema.invoices.id, inv.id));
  return { ok: true, message: "Transmitted to the customer." };
}

/** Post a signed invoice: journal, sales book lines and a debtor entry; any amount already paid becomes a cash receipt. */
export async function postInvoice(b: Business, inv: Invoice, userId: string): Promise<NrsOutcome> {
  if (!["signed", "transmitted"].includes(inv.nrsStatus)) return { ok: false, message: "Post an invoice after NRS signs it." };
  if (inv.postedAt) return { ok: false, message: "This invoice is already in your books." };
  const t = calcInvoice(inv.lines, b.vatRate);
  const sign = inv.kind === "credit" ? -1 : 1;
  const name = inv.customer.name || "Customer";
  await db.transaction(async (tx) => {
    await removeInvoicePosting(tx, b.id, inv.id);
    await writeJournal(tx, b.id, "invoice", inv.id, inv.issueDate, `${inv.number} ${name}`, sign > 0
      ? [{ code: ACC.receivable, debit: t.total }, { code: ACC.sales, credit: t.subtotal }, { code: ACC.outputVat, credit: t.tax }]
      : [{ code: ACC.sales, debit: t.subtotal }, { code: ACC.outputVat, debit: t.tax }, { code: ACC.receivable, credit: t.total }]);
    for (const l of t.lines) {
      const q = toNum(l.quantity);
      await tx.insert(schema.sales).values({
        businessId: b.id, date: inv.issueDate, customer: name, product: l.name, quantity: sign * q,
        unitPrice: q ? r2(l.ext / q) : 0, vat: sign * l.tax, paymentStatus: "Credit", invoiceId: inv.id, createdBy: userId, example: inv.example,
      });
    }
    const [party] = await tx.insert(schema.parties).values({
      businessId: b.id, sourceType: "invoice", sourceId: inv.id, kind: "Debtor", name,
      description: sign > 0 ? `${inv.number}` : `${inv.number} credit against ${inv.refIrn}`,
      amount: sign * t.total, date: inv.issueDate, dueDate: inv.dueDate, example: inv.example,
    }).returning();
    if (sign > 0 && toNum(inv.amountPaid) > 0) await recordPartyPayment(tx, b.id, party.id, toNum(inv.amountPaid), todayISO(), inv.number, userId);
    await tx.update(schema.invoices).set({ postedAt: new Date(), updatedAt: new Date() }).where(eq(schema.invoices.id, inv.id));
  });
  return { ok: true, message: "Posted to the sales book, debtors and journal." };
}

/** Update payment status. On a posted invoice, any increase becomes a cash receipt against its debtor. */
export async function setPayment(b: Business, inv: Invoice, status: string, paidInput: number, userId: string): Promise<NrsOutcome> {
  const total = toNum(inv.total);
  const paid = status === "PAID" ? total : status === "PENDING" ? 0 : r2(paidInput);
  if (status === "PARTIAL" && (paid <= 0 || paid >= total)) return { ok: false, message: "For part-payment, enter an amount above zero and below the total." };
  const prev = toNum(inv.amountPaid);
  if (inv.postedAt && paid < prev) return { ok: false, message: "This invoice is posted. To reverse a payment, delete its line in the cash book." };
  await db.transaction(async (tx) => {
    if (inv.postedAt) {
      const [party] = await tx.select().from(schema.parties).where(and(eq(schema.parties.businessId, b.id), eq(schema.parties.sourceType, "invoice"), eq(schema.parties.sourceId, inv.id))).limit(1);
      if (party && paid > prev) await recordPartyPayment(tx, b.id, party.id, r2(paid - prev), todayISO(), inv.number, userId);
      if (party) await refreshParty(tx, b.id, party.id);
    } else {
      await tx.update(schema.invoices).set({ paymentStatus: status, amountPaid: paid, updatedAt: new Date() }).where(eq(schema.invoices.id, inv.id));
    }
  });
  if (["signed", "transmitted"].includes(inv.nrsStatus) && inv.nrsProvider !== "manual") {
    const p = getProvider(b.nrsProvider, b.nrsCredentials);
    const t = Date.now();
    const res = await p.updatePayment(inv.irn, status, inv.number);
    await log(b, inv.id, p.id, "update_payment", res, t);
    if (!res.ok) return { ok: false, message: "Saved in your books, but NRS did not accept the payment update. Try again from this page.", errors: res.errors };
  }
  return { ok: true, message: "Payment updated." };
}

export async function invoiceCounts(businessId: string) {
  const rows = await db.select({ status: schema.invoices.nrsStatus, n: sql<number>`count(*)::int` }).from(schema.invoices)
    .where(eq(schema.invoices.businessId, businessId)).groupBy(schema.invoices.nrsStatus);
  return Object.fromEntries(rows.map((r) => [r.status, r.n])) as Record<string, number>;
}
