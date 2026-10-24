import { schema } from "@/db";
import { r2, toNum, todayISO } from "./format";

export type BookKey = "cash" | "sales" | "purchases" | "petty" | "inventory" | "payroll" | "assets" | "parties";
type AccountType = "asset" | "liability" | "equity" | "income" | "expense";

export type Field = {
  key: string; label: string;
  type: "date" | "text" | "number" | "select" | "account" | "checkbox";
  required?: boolean; options?: string[]; accountTypes?: AccountType[]; defaultAccount?: string;
  wide?: boolean; hint?: string;
};
export type Column = { key: string; label: string; kind?: "date" | "money" | "qty" | "text" | "status" | "account"; total?: boolean };

export const PAYMENT_OPTIONS = ["Cash", "Bank transfer", "POS", "Credit"];

export type BookDef = {
  title: string; blurb: string; singular: string;
  table: (typeof TABLES)[BookKey];
  fields: Field[]; columns: Column[];
  opening?: { key: "cashOpening" | "pettyFloat"; label: string };
  sortKey?: string;
};

export const TABLES = {
  cash: schema.cashEntries, sales: schema.sales, purchases: schema.purchases, petty: schema.pettyCash,
  inventory: schema.inventory, payroll: schema.payroll, assets: schema.assets, parties: schema.parties,
} as const;

export const BOOKS: Record<BookKey, BookDef> = {
  cash: {
    title: "Cash book", singular: "cash entry", table: TABLES.cash,
    blurb: "Every naira in or out of the business bank or cash account. Sales, purchases, payroll and petty cash top-ups paid in cash appear here automatically.",
    opening: { key: "cashOpening", label: "Opening balance (₦)" },
    fields: [
      { key: "date", label: "Date", type: "date", required: true },
      { key: "description", label: "Description", type: "text", required: true, wide: true },
      { key: "ref", label: "Ref / voucher no", type: "text" },
      { key: "moneyIn", label: "Money in (₦)", type: "number" },
      { key: "moneyOut", label: "Money out (₦)", type: "number" },
      { key: "accountId", label: "What it was for", type: "account", accountTypes: ["income", "expense", "liability", "equity", "asset"], hint: "The other side of the entry, e.g. Other income, Transport, Loans" },
    ],
    columns: [
      { key: "date", label: "Date", kind: "date" }, { key: "description", label: "Description" }, { key: "ref", label: "Ref" },
      { key: "account", label: "Account", kind: "account" },
      { key: "moneyIn", label: "Money in", kind: "money", total: true }, { key: "moneyOut", label: "Money out", kind: "money", total: true },
      { key: "balance", label: "Balance", kind: "money" },
    ],
  },
  sales: {
    title: "Sales book", singular: "sale", table: TABLES.sales,
    blurb: "Every sale, cash or credit. Amount is quantity × unit price before VAT. A cash sale adds money in to the cash book; a credit sale adds a debtor.",
    fields: [
      { key: "date", label: "Date", type: "date", required: true },
      { key: "customer", label: "Customer", type: "text", required: true },
      { key: "product", label: "Product", type: "text", required: true },
      { key: "quantity", label: "Quantity", type: "number", required: true },
      { key: "unitPrice", label: "Unit price (₦)", type: "number", required: true },
      { key: "vat", label: "Output VAT charged (₦)", type: "number", hint: "Leave empty for zero-rated or exempt produce" },
      { key: "paymentStatus", label: "Payment", type: "select", options: PAYMENT_OPTIONS },
    ],
    columns: [
      { key: "date", label: "Date", kind: "date" }, { key: "customer", label: "Customer" }, { key: "product", label: "Product" },
      { key: "quantity", label: "Qty", kind: "qty" }, { key: "unitPrice", label: "Unit price", kind: "money" },
      { key: "amount", label: "Amount", kind: "money", total: true }, { key: "vat", label: "VAT", kind: "money", total: true },
      { key: "paymentStatus", label: "Payment" },
    ],
  },
  purchases: {
    title: "Purchases book", singular: "purchase", table: TABLES.purchases,
    blurb: "Every input or item bought: seed, feed, fertiliser, packaging. Paid purchases add money out to the cash book; credit purchases add a creditor.",
    fields: [
      { key: "date", label: "Date", type: "date", required: true },
      { key: "supplier", label: "Supplier", type: "text", required: true },
      { key: "item", label: "Item", type: "text", required: true },
      { key: "quantity", label: "Quantity", type: "number", required: true },
      { key: "unitCost", label: "Unit cost (₦)", type: "number", required: true },
      { key: "vat", label: "Input VAT paid (₦)", type: "number", hint: "From the supplier's VAT invoice" },
      { key: "paymentStatus", label: "Payment", type: "select", options: PAYMENT_OPTIONS },
    ],
    columns: [
      { key: "date", label: "Date", kind: "date" }, { key: "supplier", label: "Supplier" }, { key: "item", label: "Item" },
      { key: "quantity", label: "Qty", kind: "qty" }, { key: "unitCost", label: "Unit cost", kind: "money" },
      { key: "amount", label: "Amount", kind: "money", total: true }, { key: "vat", label: "Input VAT", kind: "money", total: true },
      { key: "paymentStatus", label: "Payment" },
    ],
  },
  petty: {
    title: "Petty cash", singular: "petty cash entry", table: TABLES.petty,
    blurb: "Small day-to-day cash spending: transport, casual labour, minor repairs. Top-ups come out of the cash book.",
    opening: { key: "pettyFloat", label: "Petty cash float (₦)" },
    fields: [
      { key: "date", label: "Date", type: "date", required: true },
      { key: "description", label: "Description", type: "text", required: true, wide: true },
      { key: "voucher", label: "Voucher no", type: "text" },
      { key: "topUp", label: "Top-up from cash book (₦)", type: "number" },
      { key: "amountOut", label: "Amount spent (₦)", type: "number" },
      { key: "accountId", label: "Expense type", type: "account", accountTypes: ["expense"], defaultAccount: "6300" },
    ],
    columns: [
      { key: "date", label: "Date", kind: "date" }, { key: "description", label: "Description" }, { key: "voucher", label: "Voucher" },
      { key: "account", label: "Expense", kind: "account" },
      { key: "topUp", label: "Top-up", kind: "money", total: true }, { key: "amountOut", label: "Spent", kind: "money", total: true },
      { key: "balance", label: "Balance", kind: "money" },
    ],
  },
  inventory: {
    title: "Inventory register", singular: "stock movement", table: TABLES.inventory,
    blurb: "Inputs, growing stock and harvested produce. The balance runs per item, so one list can track every item accurately.",
    fields: [
      { key: "date", label: "Date", type: "date", required: true },
      { key: "item", label: "Item", type: "text", required: true },
      { key: "type", label: "Type", type: "select", options: ["Input", "Growing stock", "Produce", "Finished goods"] },
      { key: "unit", label: "Unit", type: "text" },
      { key: "qtyIn", label: "Qty in", type: "number" },
      { key: "qtyOut", label: "Qty out", type: "number" },
      { key: "notes", label: "Notes", type: "text", wide: true },
    ],
    columns: [
      { key: "date", label: "Date", kind: "date" }, { key: "item", label: "Item" }, { key: "type", label: "Type" }, { key: "unit", label: "Unit" },
      { key: "qtyIn", label: "Qty in", kind: "qty" }, { key: "qtyOut", label: "Qty out", kind: "qty" },
      { key: "balance", label: "Balance for item", kind: "qty" }, { key: "notes", label: "Notes" },
    ],
  },
  payroll: {
    title: "Payroll", singular: "payroll entry", table: TABLES.payroll,
    blurb: "Wages and salaries paid to staff and farm hands. Amount is days or hours worked × rate, and is paid out of the cash book.",
    fields: [
      { key: "date", label: "Date / period end", type: "date", required: true },
      { key: "staffName", label: "Staff name", type: "text", required: true },
      { key: "role", label: "Role", type: "text" },
      { key: "daysWorked", label: "Days / hours worked", type: "number", required: true },
      { key: "rate", label: "Rate (₦)", type: "number", required: true },
      { key: "method", label: "Payment method", type: "select", options: ["Cash", "Bank transfer"] },
    ],
    columns: [
      { key: "date", label: "Period", kind: "date" }, { key: "staffName", label: "Staff" }, { key: "role", label: "Role" },
      { key: "daysWorked", label: "Days/hours", kind: "qty" }, { key: "rate", label: "Rate", kind: "money" },
      { key: "amount", label: "Amount paid", kind: "money", total: true }, { key: "method", label: "Method" },
    ],
  },
  assets: {
    title: "Asset register", singular: "asset", table: TABLES.assets,
    blurb: "Equipment, machinery, vehicles and land improvements, depreciated on a straight line.",
    fields: [
      { key: "date", label: "Date acquired", type: "date", required: true },
      { key: "name", label: "Asset", type: "text", required: true },
      { key: "description", label: "Description", type: "text" },
      { key: "cost", label: "Cost (₦)", type: "number", required: true },
      { key: "lifeYears", label: "Useful life (years)", type: "number", required: true },
      { key: "paidFromCash", label: "Paid from the cash book", type: "checkbox", hint: "Leave unticked for assets the business already owned" },
    ],
    columns: [
      { key: "date", label: "Acquired", kind: "date" }, { key: "name", label: "Asset" }, { key: "description", label: "Description" },
      { key: "cost", label: "Cost", kind: "money", total: true }, { key: "lifeYears", label: "Life (yrs)", kind: "qty" },
      { key: "annualDep", label: "Annual depreciation", kind: "money", total: true },
      { key: "accDep", label: "Depreciated to date", kind: "money", total: true }, { key: "bookValue", label: "Book value today", kind: "money", total: true },
    ],
  },
  parties: {
    title: "Debtors and creditors", singular: "balance", table: TABLES.parties, sortKey: "dueDate",
    blurb: "Who owes the business and who the business owes. Credit sales, credit purchases and posted e-invoices add entries here; record payments as they arrive.",
    fields: [
      { key: "kind", label: "Type", type: "select", options: ["Debtor", "Creditor"], required: true },
      { key: "name", label: "Name", type: "text", required: true },
      { key: "description", label: "Description", type: "text", wide: true },
      { key: "amount", label: "Amount (₦)", type: "number", required: true },
      { key: "date", label: "Date", type: "date", required: true },
      { key: "dueDate", label: "Due date", type: "date" },
      { key: "accountId", label: "Arose from", type: "account", accountTypes: ["equity", "income", "expense", "liability", "asset"], defaultAccount: "3000", hint: "Owner's capital and opening balances for amounts brought forward" },
    ],
    columns: [
      { key: "kind", label: "Type", kind: "status" }, { key: "name", label: "Name" }, { key: "description", label: "Description" },
      { key: "amount", label: "Amount", kind: "money", total: true }, { key: "paid", label: "Paid", kind: "money", total: true },
      { key: "outstanding", label: "Outstanding", kind: "money", total: true },
      { key: "date", label: "Date", kind: "date" }, { key: "dueDate", label: "Due", kind: "date" }, { key: "status", label: "Status", kind: "status" },
    ],
  },
};

export const BOOK_KEYS = Object.keys(BOOKS) as BookKey[];
export const isBook = (k: string): k is BookKey => k in BOOKS;

type Row = Record<string, unknown> & { id: string };

/** Adds the workbook's computed columns (amount, running balance, depreciation, outstanding). Rows must be in ledger order. */
export function computeRows(book: BookKey, rows: Row[], opts: { cashOpening?: number; pettyFloat?: number; today?: string } = {}) {
  const today = opts.today ?? todayISO();
  switch (book) {
    case "cash": { let b = toNum(opts.cashOpening); return rows.map((r) => ({ ...r, balance: (b = r2(b + toNum(r.moneyIn) - toNum(r.moneyOut))) })); }
    case "petty": { let b = toNum(opts.pettyFloat); return rows.map((r) => ({ ...r, balance: (b = r2(b + toNum(r.topUp) - toNum(r.amountOut))) })); }
    case "sales": return rows.map((r) => ({ ...r, amount: r2(toNum(r.quantity) * toNum(r.unitPrice)) }));
    case "purchases": return rows.map((r) => ({ ...r, amount: r2(toNum(r.quantity) * toNum(r.unitCost)) }));
    case "payroll": return rows.map((r) => ({ ...r, amount: r2(toNum(r.daysWorked) * toNum(r.rate)) }));
    case "inventory": {
      const bal: Record<string, number> = {};
      return rows.map((r) => { const k = String(r.item ?? "").trim().toLowerCase(); bal[k] = (bal[k] ?? 0) + toNum(r.qtyIn) - toNum(r.qtyOut); return { ...r, balance: bal[k] }; });
    }
    case "assets": return rows.map((r) => ({ ...r, ...depreciation(toNum(r.cost), toNum(r.lifeYears), String(r.date), today) }));
    case "parties": return rows.map((r) => {
      const amount = toNum(r.amount), paid = toNum(r.paid), outstanding = r2(amount - paid);
      const settled = amount <= 0 || outstanding <= 0;
      const overdue = !settled && !!r.dueDate && String(r.dueDate) < today;
      return { ...r, outstanding, overdue, status: amount < 0 ? "Credit" : settled ? "Settled" : overdue ? "Overdue" : paid > 0 ? "Part-paid" : "Outstanding" };
    });
  }
}

export function depreciation(cost: number, life: number, acquired: string, asOf: string) {
  const annualDep = life > 0 ? r2(cost / life) : 0;
  const years = Math.max(0, (Date.parse(asOf) - Date.parse(acquired)) / (365.25 * 864e5));
  const accDep = r2(Math.min(cost, annualDep * years));
  return { annualDep, accDep, bookValue: r2(cost - accDep) };
}
