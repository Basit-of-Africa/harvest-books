import {
  pgTable, uuid, text, timestamp, boolean, integer, numeric, date, jsonb, pgEnum, primaryKey, uniqueIndex, index,
} from "drizzle-orm/pg-core";

const money = (name: string) => numeric(name, { precision: 16, scale: 2, mode: "number" });
const qty = (name: string) => numeric(name, { precision: 16, scale: 3, mode: "number" });
const id = () => uuid("id").primaryKey().defaultRandom();
const created = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const biz = () => uuid("business_id").notNull().references(() => businesses.id, { onDelete: "cascade" });

export const roleEnum = pgEnum("role", ["owner", "accountant", "viewer"]);
export const accountTypeEnum = pgEnum("account_type", ["asset", "liability", "equity", "income", "expense"]);

/* ---------- people and businesses ---------- */
export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: created(),
}, (t) => [uniqueIndex("users_email_idx").on(t.email)]);

export const businesses = pgTable("businesses", {
  id: id(),
  name: text("name").notNull(),
  tin: text("tin").notNull().default(""),
  description: text("description").notNull().default(""),
  email: text("email").notNull().default(""),
  phone: text("phone").notNull().default(""),
  street: text("street").notNull().default(""),
  city: text("city").notNull().default(""),
  state: text("state").notNull().default(""),
  postalCode: text("postal_code").notNull().default(""),
  country: text("country").notNull().default("NG"),
  nrsBusinessId: text("nrs_business_id").notNull().default(""),
  nrsServiceId: text("nrs_service_id").notNull().default(""),
  vatRate: numeric("vat_rate", { precision: 5, scale: 2, mode: "number" }).notNull().default(7.5),
  invPrefix: text("inv_prefix").notNull().default("INV"),
  crnPrefix: text("crn_prefix").notNull().default("CRN"),
  dbnPrefix: text("dbn_prefix").notNull().default("DBN"),
  codeInvoice: text("code_invoice").notNull().default("380"),
  codeCredit: text("code_credit").notNull().default("381"),
  codeDebit: text("code_debit").notNull().default("384"),
  brandColor: text("brand_color").notNull().default("#1D5A3E"),
  logo: text("logo").notNull().default(""),
  bankDetails: text("bank_details").notNull().default(""),
  terms: text("terms").notNull().default("Payment due within 30 days of invoice date."),
  cashOpening: money("cash_opening").notNull().default(0),
  cashOpeningDate: date("cash_opening_date"),
  pettyFloat: money("petty_float").notNull().default(0),
  /* NRS connection: provider name plus AES-GCM encrypted JSON of credentials */
  nrsProvider: text("nrs_provider").notNull().default("sandbox"),
  nrsCredentials: text("nrs_credentials").notNull().default(""),
  createdAt: created(),
});

export const memberships = pgTable("memberships", {
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  businessId: biz(),
  role: roleEnum("role").notNull(),
  createdAt: created(),
}, (t) => [primaryKey({ columns: [t.userId, t.businessId] })]);

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(), // sha256 of the cookie token
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  businessId: uuid("business_id").references(() => businesses.id, { onDelete: "set null" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: created(),
});

export const invites = pgTable("invites", {
  id: id(),
  businessId: biz(),
  email: text("email").notNull(),
  role: roleEnum("role").notNull(),
  tokenHash: text("token_hash").notNull(),
  invitedBy: uuid("invited_by").references(() => users.id, { onDelete: "set null" }),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: created(),
});

/* ---------- double-entry core ---------- */
export const accounts = pgTable("accounts", {
  id: id(),
  businessId: biz(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  type: accountTypeEnum("type").notNull(),
  system: boolean("system").notNull().default(false),
}, (t) => [uniqueIndex("accounts_code_idx").on(t.businessId, t.code)]);

export const journalEntries = pgTable("journal_entries", {
  id: id(),
  businessId: biz(),
  date: date("date").notNull(),
  memo: text("memo").notNull().default(""),
  sourceType: text("source_type").notNull(),
  sourceId: text("source_id").notNull(),
  createdAt: created(),
}, (t) => [index("je_source_idx").on(t.businessId, t.sourceType, t.sourceId), index("je_date_idx").on(t.businessId, t.date)]);

export const journalLines = pgTable("journal_lines", {
  id: id(),
  entryId: uuid("entry_id").notNull().references(() => journalEntries.id, { onDelete: "cascade" }),
  accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  debit: money("debit").notNull().default(0),
  credit: money("credit").notNull().default(0),
}, (t) => [index("jl_entry_idx").on(t.entryId), index("jl_account_idx").on(t.accountId)]);

/* ---------- the nine books ---------- */
const bookCols = () => ({
  id: id(),
  businessId: biz(),
  example: boolean("example").notNull().default(false),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: created(),
});
/** Rows generated by another record (a sale paid in cash creates a cash book line) carry its type and id. */
const linked = () => ({ sourceType: text("source_type"), sourceId: text("source_id") });

export const cashEntries = pgTable("cash_entries", {
  ...bookCols(), ...linked(),
  date: date("date").notNull(),
  description: text("description").notNull(),
  ref: text("ref").notNull().default(""),
  moneyIn: money("money_in").notNull().default(0),
  moneyOut: money("money_out").notNull().default(0),
  accountId: uuid("account_id").references(() => accounts.id),
}, (t) => [index("cash_biz_date_idx").on(t.businessId, t.date)]);

export const sales = pgTable("sales", {
  ...bookCols(),
  date: date("date").notNull(),
  customer: text("customer").notNull(),
  product: text("product").notNull(),
  quantity: qty("quantity").notNull(),
  unitPrice: money("unit_price").notNull(),
  vat: money("vat").notNull().default(0),
  paymentStatus: text("payment_status").notNull().default("Cash"),
  invoiceId: uuid("invoice_id"),
}, (t) => [index("sales_biz_date_idx").on(t.businessId, t.date)]);

export const purchases = pgTable("purchases", {
  ...bookCols(),
  date: date("date").notNull(),
  supplier: text("supplier").notNull(),
  item: text("item").notNull(),
  quantity: qty("quantity").notNull(),
  unitCost: money("unit_cost").notNull(),
  vat: money("vat").notNull().default(0),
  paymentStatus: text("payment_status").notNull().default("Bank transfer"),
}, (t) => [index("purch_biz_date_idx").on(t.businessId, t.date)]);

export const pettyCash = pgTable("petty_cash", {
  ...bookCols(),
  date: date("date").notNull(),
  description: text("description").notNull(),
  voucher: text("voucher").notNull().default(""),
  topUp: money("top_up").notNull().default(0),
  amountOut: money("amount_out").notNull().default(0),
  accountId: uuid("account_id").references(() => accounts.id),
});

export const inventory = pgTable("inventory", {
  ...bookCols(),
  date: date("date").notNull(),
  item: text("item").notNull(),
  type: text("type").notNull().default("Input"),
  unit: text("unit").notNull().default(""),
  qtyIn: qty("qty_in").notNull().default(0),
  qtyOut: qty("qty_out").notNull().default(0),
  notes: text("notes").notNull().default(""),
});

export const payroll = pgTable("payroll", {
  ...bookCols(),
  date: date("date").notNull(),
  staffName: text("staff_name").notNull(),
  role: text("role").notNull().default(""),
  daysWorked: qty("days_worked").notNull(),
  rate: money("rate").notNull(),
  method: text("method").notNull().default("Cash"),
});

export const assets = pgTable("assets", {
  ...bookCols(),
  date: date("date").notNull(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  cost: money("cost").notNull(),
  lifeYears: numeric("life_years", { precision: 6, scale: 2, mode: "number" }).notNull(),
  paidFromCash: boolean("paid_from_cash").notNull().default(false),
});

export const parties = pgTable("parties", {
  ...bookCols(), ...linked(),
  kind: text("kind").notNull(), // Debtor | Creditor
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  amount: money("amount").notNull(),
  paid: money("paid").notNull().default(0),
  date: date("date").notNull(),
  dueDate: date("due_date"),
  /** Counter account for entries typed in by hand (opening balance, or a sale or expense not in another book). */
  accountId: uuid("account_id").references(() => accounts.id),
});

/* ---------- invoicing ---------- */
export const customers = pgTable("customers", {
  id: id(),
  businessId: biz(),
  name: text("name").notNull(),
  tin: text("tin").notNull().default(""),
  email: text("email").notNull().default(""),
  phone: text("phone").notNull().default(""),
  street: text("street").notNull().default(""),
  city: text("city").notNull().default(""),
  postalCode: text("postal_code").notNull().default(""),
  country: text("country").notNull().default("NG"),
  createdAt: created(),
}, (t) => [uniqueIndex("customers_name_idx").on(t.businessId, t.name)]);

export const items = pgTable("items", {
  id: id(),
  businessId: biz(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  hsCode: text("hs_code").notNull().default(""),
  category: text("category").notNull().default(""),
  unit: text("unit").notNull().default("EA"),
  price: money("price").notNull().default(0),
  taxCategory: text("tax_category").notNull().default("STANDARD_VAT"),
  createdAt: created(),
}, (t) => [uniqueIndex("items_name_idx").on(t.businessId, t.name)]);

export type InvoiceLine = {
  name: string; description: string; hsCode: string; category: string;
  quantity: number; unit: string; price: number; discount: number; taxCategory: string;
};
export type PartySnapshot = {
  name: string; tin: string; email: string; phone: string; street: string; city: string; postalCode: string; country: string;
};

export const invoices = pgTable("invoices", {
  id: id(),
  businessId: biz(),
  kind: text("kind").notNull().default("invoice"), // invoice | credit | debit
  transactionType: text("transaction_type").notNull().default("B2B"), // B2B | B2G | B2C
  number: text("number").notNull(),
  issueDate: date("issue_date").notNull(),
  issueTime: text("issue_time").notNull().default("00:00:00"),
  dueDate: date("due_date"),
  paymentMeans: text("payment_means").notNull().default("30"),
  paymentStatus: text("payment_status").notNull().default("PENDING"), // PENDING | PARTIAL | PAID
  amountPaid: money("amount_paid").notNull().default(0),
  customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
  customer: jsonb("customer").$type<PartySnapshot>().notNull(),
  lines: jsonb("lines").$type<InvoiceLine[]>().notNull(),
  note: text("note").notNull().default(""),
  refIrn: text("ref_irn").notNull().default(""),
  refDate: date("ref_date"),
  subtotal: money("subtotal").notNull().default(0),
  taxTotal: money("tax_total").notNull().default(0),
  total: money("total").notNull().default(0),
  irn: text("irn").notNull().default(""),
  nrsStatus: text("nrs_status").notNull().default("draft"), // draft | validated | signed | transmitted | failed
  nrsProvider: text("nrs_provider").notNull().default(""),
  nrsSimulated: boolean("nrs_simulated").notNull().default(false),
  nrsCsid: text("nrs_csid").notNull().default(""),
  nrsQr: text("nrs_qr").notNull().default(""),
  nrsErrors: jsonb("nrs_errors").$type<string[]>().notNull().default([]),
  nrsSignedAt: timestamp("nrs_signed_at", { withTimezone: true }),
  nrsTransmittedAt: timestamp("nrs_transmitted_at", { withTimezone: true }),
  postedAt: timestamp("posted_at", { withTimezone: true }),
  emailedAt: timestamp("emailed_at", { withTimezone: true }),
  example: boolean("example").notNull().default(false),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: created(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("invoices_number_idx").on(t.businessId, t.number), index("invoices_date_idx").on(t.businessId, t.issueDate)]);

export const nrsLogs = pgTable("nrs_logs", {
  id: id(),
  businessId: biz(),
  invoiceId: uuid("invoice_id").references(() => invoices.id, { onDelete: "set null" }),
  provider: text("provider").notNull(),
  action: text("action").notNull(),
  ok: boolean("ok").notNull(),
  httpStatus: integer("http_status"),
  request: jsonb("request"),
  response: jsonb("response"),
  durationMs: integer("duration_ms"),
  createdAt: created(),
}, (t) => [index("nrs_logs_inv_idx").on(t.invoiceId)]);
