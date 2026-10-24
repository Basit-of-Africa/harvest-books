/**
 * Demo data: a sign-in, a business and the example rows from the Simple Bookkeeping Pack, posted through the
 * same rules the app uses. Run with `npm run db:seed`. Safe to run twice: it skips if the demo user exists.
 */
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { readFileSync } from "node:fs";
import { getDb, schema } from "../src/db";
import { seedChart } from "../src/lib/accounts";
import { postBookRecord, postOpening } from "../src/lib/posting";
import { calcInvoice } from "../src/lib/nrs/core";

const EMAIL = process.env.SEED_EMAIL ?? "demo@harvestbooks.ng";
const PASSWORD = process.env.SEED_PASSWORD ?? "harvest-demo-2026";

async function main() {
  const db = getDb();
  const [exists] = await db.select().from(schema.users).where(eq(schema.users.email, EMAIL)).limit(1);
  if (exists) { console.log(`Demo user ${EMAIL} already exists; nothing to do.`); process.exit(0); }
  const pack = JSON.parse(readFileSync("data/sample-books.json", "utf8"));

  await db.transaction(async (tx) => {
    const [u] = await tx.insert(schema.users).values({ email: EMAIL, name: "Demo Owner", passwordHash: await bcrypt.hash(PASSWORD, 12) }).returning();
    const [b] = await tx.insert(schema.businesses).values({
      name: "Demo Agro Farms", email: EMAIL, city: "Osogbo", state: "Osun", country: "NG",
      description: "Maize and soybean production", cashOpening: pack.settings.cashOpening, pettyFloat: pack.settings.pettyFloat, cashOpeningDate: "2026-01-01",
      bankDetails: "Example Bank\nDemo Agro Farms\n0000000000",
    }).returning();
    await tx.insert(schema.memberships).values({ userId: u.id, businessId: b.id, role: "owner" });
    await seedChart(tx, b.id);
    await postOpening(tx, b);
    const base = { businessId: b.id, example: true, createdBy: u.id };
    const add = async (book: string, table: any, values: Record<string, unknown>) => {
      const [row] = (await tx.insert(table).values({ ...base, ...values }).returning()) as any[];
      await postBookRecord(tx, b.id, book, row);
    };
    // The workbook's cash book example is the same maize sale as its sales book example. Here a cash sale writes its own
    // cash book line, so only cash entries that are not sales are seeded.
    for (const r of pack.cash.filter((c: any) => !/^sale of/i.test(c.desc))) await add("cash", schema.cashEntries, { date: r.date, description: r.desc, ref: r.ref, moneyIn: r.in || 0, moneyOut: r.out || 0 });
    for (const r of pack.sales) await add("sales", schema.sales, { date: r.date, customer: r.customer, product: r.product, quantity: r.qty, unitPrice: r.price, paymentStatus: r.status });
    for (const r of pack.purchases) await add("purchases", schema.purchases, { date: r.date, supplier: r.supplier, item: r.item, quantity: r.qty, unitCost: r.cost, vat: r.vat || 0, paymentStatus: r.status });
    for (const r of pack.petty) await add("petty", schema.pettyCash, { date: r.date, description: r.desc, voucher: r.voucher, topUp: r.topup || 0, amountOut: r.out || 0 });
    for (const r of pack.inventory) await add("inventory", schema.inventory, { date: r.date, item: r.item, type: r.type, unit: r.unit, qtyIn: r.qin || 0, qtyOut: r.qout || 0, notes: r.notes });
    for (const r of pack.payroll) await add("payroll", schema.payroll, { date: r.date, staffName: r.name, role: r.role, daysWorked: r.days, rate: r.rate, method: r.method });
    for (const r of pack.assets) await add("assets", schema.assets, { date: r.date, name: r.asset, description: r.desc, cost: r.cost, lifeYears: r.life, paidFromCash: false });
    for (const r of pack.parties) await add("parties", schema.parties, { kind: r.kind, name: r.name, description: r.desc, amount: r.amount, date: r.date, dueDate: r.due });
    for (const i of pack.invoices) {
      const lines = i.lines.map((l: any) => ({ name: l.name, description: l.desc, hsCode: l.hsn, category: l.category, quantity: l.qty, unit: l.unit, price: l.price, discount: 0, taxCategory: l.tax }));
      const t = calcInvoice(lines, b.vatRate);
      await tx.insert(schema.invoices).values({
        businessId: b.id, example: true, createdBy: u.id, kind: "invoice", transactionType: i.invKind, number: i.number, issueDate: i.issueDate, issueTime: i.issueTime,
        dueDate: i.dueDate, paymentMeans: i.payMeans, customer: { ...i.customer, postalCode: i.customer.postal ?? "" }, lines, note: i.note,
        subtotal: t.subtotal, taxTotal: t.tax, total: t.total,
      });
    }
  });
  console.log(`Seeded. Sign in as ${EMAIL} with password ${PASSWORD}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
