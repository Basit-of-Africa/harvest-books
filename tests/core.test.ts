import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPayload, calcInvoice, irnFor, validateInvoice, type InvoiceDraft, type SupplierProfile } from "../src/lib/nrs/core";
import { computeRows, depreciation } from "../src/lib/books";

const supplier: SupplierProfile = {
  name: "Demo Agro Farms", tin: "12345678-0001", email: "accounts@demo.ng", phone: "+2348012345678", street: "1 Farm Road", city: "Osogbo",
  postalCode: "230001", country: "NG", description: "", nrsBusinessId: "3fa85f64-5717-4562-b3fc-2c963f66afa6", nrsServiceId: "AB12CD34",
  vatRate: 7.5, codeInvoice: "380", codeCredit: "381", codeDebit: "384",
};
const draft = (over: Partial<InvoiceDraft> = {}): InvoiceDraft => ({
  kind: "invoice", transactionType: "B2B", number: "INV0001", issueDate: "2026-01-10", issueTime: "10:30:00", dueDate: "2026-02-10",
  paymentMeans: "30", paymentStatus: "PENDING", note: "", refIrn: "", refDate: null,
  customer: { name: "Alaba Foods Ltd", tin: "98765432-0001", email: "ap@alaba.ng", phone: "+2348098765432", street: "", city: "Ibadan", postalCode: "", country: "NG" },
  lines: [
    { name: "Maize (50kg bags)", description: "", hsCode: "1005.90", category: "Agricultural produce", quantity: 30, unit: "BG", price: 5000, discount: 0, taxCategory: "ZERO_VAT" },
    { name: "Drying service", description: "", hsCode: "9983", category: "Services", quantity: 2, unit: "DAY", price: 20000, discount: 1000, taxCategory: "STANDARD_VAT" },
  ],
  ...over,
});

test("totals group VAT by category and apply discounts before tax", () => {
  const t = calcInvoice(draft().lines, 7.5);
  assert.equal(t.subtotal, 189000);
  assert.equal(t.tax, 2925); // 7.5% of 39,000
  assert.equal(t.total, 191925);
  assert.deepEqual(t.subtotals.map((s) => [s.id, s.taxable, s.tax]), [["ZERO_VAT", 150000, 0], ["STANDARD_VAT", 39000, 2925]]);
});

test("IRN is invoice number, service ID and YYYYMMDD", () => {
  assert.equal(irnFor("INV0001", "AB12CD34", "2026-01-10"), "INV0001-AB12CD34-20260110");
});

test("a complete invoice passes validation", () => {
  const v = validateInvoice(draft(), supplier);
  assert.deepEqual(v.errors, []);
  assert.equal(v.irn, "INV0001-AB12CD34-20260110");
});

test("validation names what is missing", () => {
  const v = validateInvoice(draft({ number: "INV-1", customer: { ...draft().customer, tin: "" } }), { ...supplier, nrsServiceId: "short", phone: "08012345678" });
  const msgs = v.errors.map((e) => e.message).join(" | ");
  assert.match(msgs, /Service ID/);
  assert.match(msgs, /\+234/);
  assert.match(msgs, /letters and numbers only/);
  assert.match(msgs, /customer's TIN/);
});

test("credit notes must reference the original IRN", () => {
  const v = validateInvoice(draft({ kind: "credit", number: "CRN0001" }), supplier);
  assert.ok(v.errors.some((e) => /reference the IRN/.test(e.message)));
});

test("payload carries the NRS field names and totals", () => {
  const p: any = buildPayload(draft(), supplier);
  assert.equal(p.irn, "INV0001-AB12CD34-20260110");
  assert.equal(p.invoice_type_code, "380");
  assert.equal(p.business_id, supplier.nrsBusinessId);
  assert.equal(p.accounting_supplier_party.tin, supplier.tin);
  assert.equal(p.accounting_customer_party.party_name, "Alaba Foods Ltd");
  assert.equal(p.legal_monetary_total.payable_amount, 191925);
  assert.equal(p.invoice_line[1].discount_amount, 1000);
  assert.equal(p.invoice_line[1].line_extension_amount, 39000);
  assert.equal(p.tax_total[0].tax_subtotal[1].tax_category.id, "STANDARD_VAT");
  assert.equal(p.billing_reference, undefined);
});

test("B2C without a TIN leaves the customer block out", () => {
  const p: any = buildPayload(draft({ transactionType: "B2C", customer: { ...draft().customer, tin: "" } }), supplier);
  assert.equal(p.accounting_customer_party, undefined);
});

test("workbook formulas: running balances, per-item stock and straight-line depreciation", () => {
  const cash = computeRows("cash", [{ id: "1", moneyIn: 85000, moneyOut: 0 }, { id: "2", moneyIn: 0, moneyOut: 3500 }], { cashOpening: 250000 });
  assert.deepEqual(cash.map((r: any) => r.balance), [335000, 331500]);
  const inv = computeRows("inventory", [{ id: "1", item: "NPK", qtyIn: 20, qtyOut: 0 }, { id: "2", item: "Maize", qtyIn: 50, qtyOut: 0 }, { id: "3", item: "npk ", qtyIn: 0, qtyOut: 5 }]);
  assert.deepEqual(inv.map((r: any) => r.balance), [20, 50, 15]);
  const d = depreciation(180000, 5, "2025-11-10", "2026-11-10");
  assert.equal(d.annualDep, 36000);
  assert.ok(Math.abs(d.accDep - 36000) < 100);
});
