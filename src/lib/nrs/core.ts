/**
 * Pure NRS e-invoice logic shared by the browser editor and the server: totals, IRN, validation and the payload.
 * Field names follow the NRS e-invoice specification (UBL-based JSON) as published by accredited APPs.
 */
import { r2, toNum } from "../format";
import type { InvoiceLine, PartySnapshot } from "@/db/schema";

export const TAX_CATEGORIES: Record<string, string> = { STANDARD_VAT: "Standard VAT", ZERO_VAT: "Zero-rated VAT", EXEMPTED: "VAT exempt" };
export const UNITS: [string, string][] = [["EA", "Each"], ["KGM", "Kilogram"], ["TNE", "Tonne"], ["LTR", "Litre"], ["BG", "Bag"], ["HUR", "Hour"], ["DAY", "Day"]];
export const PAYMENT_MEANS: [string, string][] = [["10", "Cash"], ["30", "Credit transfer"], ["42", "Payment to bank account"], ["48", "Bank card"], ["49", "Direct debit"]];
export const KIND_LABEL: Record<string, string> = { invoice: "Invoice", credit: "Credit note", debit: "Debit note" };
export const NRS_STATUS_LABEL: Record<string, string> = { draft: "Draft", validated: "Validated", signed: "Signed by NRS", transmitted: "Transmitted", failed: "Rejected" };
export const PAY_LABEL: Record<string, string> = { PENDING: "Unpaid", PARTIAL: "Part-paid", PAID: "Paid" };

export type SupplierProfile = {
  name: string; tin: string; email: string; phone: string; street: string; city: string; postalCode: string; country: string;
  description: string; nrsBusinessId: string; nrsServiceId: string; vatRate: number;
  codeInvoice: string; codeCredit: string; codeDebit: string;
};
export type InvoiceDraft = {
  kind: string; transactionType: string; number: string; issueDate: string; issueTime: string; dueDate: string | null;
  paymentMeans: string; paymentStatus: string; customer: PartySnapshot; lines: InvoiceLine[]; note: string;
  refIrn: string; refDate: string | null; irn?: string;
};

export function calcInvoice(lines: InvoiceLine[], vatRate: number) {
  const out = lines.map((l) => {
    const gross = r2(toNum(l.quantity) * toNum(l.price));
    const discount = r2(toNum(l.discount));
    const ext = r2(gross - discount);
    const pct = (l.taxCategory || "STANDARD_VAT") === "STANDARD_VAT" ? toNum(vatRate) : 0;
    return { ...l, gross, discount, ext, pct, tax: r2((ext * pct) / 100) };
  });
  const groups = new Map<string, { id: string; pct: number; taxable: number; tax: number }>();
  for (const l of out) {
    const id = l.taxCategory || "STANDARD_VAT";
    const g = groups.get(id) ?? { id, pct: l.pct, taxable: 0, tax: 0 };
    g.taxable = r2(g.taxable + l.ext); g.tax = r2(g.tax + l.tax); groups.set(id, g);
  }
  const subtotal = r2(out.reduce((s, l) => s + l.ext, 0));
  const tax = r2(out.reduce((s, l) => s + l.tax, 0));
  return { lines: out, subtotal, tax, total: r2(subtotal + tax), subtotals: [...groups.values()] };
}

/** IRN = invoice number + NRS Service ID + issue date (YYYYMMDD), joined by dashes. */
export const irnFor = (number: string, serviceId: string, issueDate: string) => `${number}-${serviceId}-${String(issueDate).replace(/-/g, "")}`;

export const typeCode = (kind: string, s: SupplierProfile) => (kind === "credit" ? s.codeCredit : kind === "debit" ? s.codeDebit : s.codeInvoice);

const RX = {
  uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  email: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/,
  phone: /^\+234\d{10}$/,
  serviceId: /^[A-Za-z0-9]{8}$/,
  number: /^[A-Za-z0-9]+$/,
  country: /^[A-Z]{2}$/,
  time: /^\d{2}:\d{2}:\d{2}$/,
};
export type Issue = { message: string; where: "setup" | "invoice" };

export function validateInvoice(inv: InvoiceDraft, s: SupplierProfile): { errors: Issue[]; warnings: string[]; irn: string } {
  const errors: Issue[] = [], warnings: string[] = [];
  const e = (message: string, where: Issue["where"] = "invoice") => errors.push({ message, where });
  if (!s.name) e("Add your registered business name in setup.", "setup");
  if (!s.tin) e("Add your Tax Identification Number (TIN) in setup.", "setup");
  if (!RX.uuid.test(s.nrsBusinessId)) e("The NRS Business ID must be the 36-character ID from your e-invoicing profile.", "setup");
  if (!RX.serviceId.test(s.nrsServiceId)) e("The NRS Service ID must be the 8-character code from your profile. It forms part of every IRN.", "setup");
  if (!RX.email.test(s.email)) e("Add a valid business email address in setup.", "setup");
  if (!RX.phone.test(s.phone)) e("Business phone must use +234 format, for example +2348012345678.", "setup");
  if (!s.street || !s.city) e("Add your business street address and city in setup.", "setup");
  if (!RX.country.test(s.country)) e("Business country must be a two-letter code such as NG.", "setup");

  if (!RX.number.test(inv.number)) e("Invoice number must use letters and numbers only, with no spaces or dashes.");
  if (!inv.issueDate) e("Add the issue date.");
  if (!RX.time.test(inv.issueTime)) e("Issue time must be in HH:MM:SS format.");
  if (inv.dueDate && inv.issueDate && inv.dueDate < inv.issueDate) e("The due date cannot be before the issue date.");
  if (!inv.dueDate) warnings.push("No due date set. NRS accepts this, but debtor tracking needs one.");
  const c = inv.customer;
  if (inv.transactionType !== "B2C") {
    if (!c.name) e("Add the customer's name.");
    if ((c.tin ?? "").trim().length < 5) e(`A ${inv.transactionType} invoice needs the customer's TIN (at least 5 characters).`);
    if (!RX.email.test(c.email ?? "")) e("Add the customer's email address.");
    if (!c.phone) e("Add the customer's phone number.");
    if (!c.city) e("Add the customer's city.");
    if (!RX.country.test(c.country ?? "")) e("Customer country must be a two-letter code such as NG.");
  } else if (!c.name) warnings.push("No customer name. Consumer invoices can leave the buyer out, but a name helps your records.");
  if (inv.kind !== "invoice") {
    if (!inv.refIrn) e(`A ${KIND_LABEL[inv.kind].toLowerCase()} must reference the IRN of the original invoice.`);
    if (!inv.refDate) e("Add the issue date of the original invoice.");
  }
  if (!inv.lines.length) e("Add at least one line item.");
  inv.lines.forEach((l, i) => {
    const n = `Line ${i + 1}`;
    if (!l.name) e(`${n}: add the item name.`);
    if (!l.hsCode) e(`${n}: add the HS code.`);
    if (!l.category) e(`${n}: add the product category.`);
    if (!(toNum(l.quantity) > 0)) e(`${n}: quantity must be more than zero.`);
    if (!(toNum(l.price) > 0)) e(`${n}: unit price must be more than zero.`);
    if (toNum(l.discount) > toNum(l.quantity) * toNum(l.price)) e(`${n}: the discount is larger than the line amount.`);
    if (!TAX_CATEGORIES[l.taxCategory]) e(`${n}: choose a tax category.`);
  });
  const irn = irnFor(inv.number, s.nrsServiceId, inv.issueDate);
  if (irn.length > 50) e("The IRN would be longer than 50 characters. Shorten the invoice number.");
  return { errors, warnings, irn };
}

const strip = <T,>(o: T): T => JSON.parse(JSON.stringify(o, (_k, v) => (v === "" || v === undefined ? undefined : v)));

/** The JSON body NRS expects for validate and sign. */
export function buildPayload(inv: InvoiceDraft, s: SupplierProfile) {
  const t = calcInvoice(inv.lines, s.vatRate);
  const irn = inv.irn || irnFor(inv.number, s.nrsServiceId, inv.issueDate);
  const c = inv.customer;
  const withCustomer = inv.transactionType !== "B2C" || !!c.tin;
  return strip({
    business_id: s.nrsBusinessId,
    irn,
    issue_date: inv.issueDate,
    due_date: inv.dueDate ?? undefined,
    issue_time: inv.issueTime,
    invoice_type_code: typeCode(inv.kind, s),
    invoice_kind: inv.transactionType,
    payment_status: inv.paymentStatus,
    note: inv.note,
    tax_point_date: inv.issueDate,
    document_currency_code: "NGN",
    tax_currency_code: "NGN",
    billing_reference: inv.kind !== "invoice" ? [{ irn: inv.refIrn, issue_date: inv.refDate }] : undefined,
    accounting_supplier_party: {
      party_name: s.name, tin: s.tin, email: s.email, telephone: s.phone, business_description: s.description,
      postal_address: { street_name: s.street, city_name: s.city, postal_zone: s.postalCode, country: s.country },
    },
    accounting_customer_party: withCustomer ? {
      party_name: c.name, tin: c.tin, email: c.email, telephone: c.phone,
      postal_address: { street_name: c.street, city_name: c.city, postal_zone: c.postalCode, country: c.country || "NG" },
    } : undefined,
    payment_means: [{ payment_means_code: inv.paymentMeans, payment_due_date: inv.dueDate ?? inv.issueDate }],
    tax_total: [{
      tax_amount: t.tax,
      tax_subtotal: t.subtotals.map((g) => ({ taxable_amount: g.taxable, tax_amount: g.tax, tax_category: { id: g.id, percent: g.pct } })),
    }],
    legal_monetary_total: { line_extension_amount: t.subtotal, tax_exclusive_amount: t.subtotal, tax_inclusive_amount: t.total, payable_amount: t.total },
    invoice_line: t.lines.map((l) => ({
      hsn_code: l.hsCode, product_category: l.category,
      discount_amount: l.discount || undefined,
      invoiced_quantity: toNum(l.quantity), line_extension_amount: l.ext,
      item: { name: l.name, description: l.description || l.name, sellers_item_identification: l.hsCode },
      price: { price_amount: toNum(l.price), base_quantity: 1, price_unit: l.unit || "EA" },
    })),
  });
}

export type NrsPayload = ReturnType<typeof buildPayload>;
