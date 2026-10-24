/** Integration test: needs DATABASE_URL pointing at a migrated, disposable database. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { eq, sql } from "drizzle-orm";
import { getDb, schema } from "../src/db";
import { seedChart } from "../src/lib/accounts";
import { postBookRecord, recordPartyPayment, unpostBookRecord } from "../src/lib/posting";

const skip = !process.env.DATABASE_URL;

test("every posting balances and generated rows follow their source", { skip }, async () => {
  const db = getDb();
  const [b] = await db.insert(schema.businesses).values({ name: "Posting test " + Date.now() }).returning();
  await seedChart(db, b.id);
  const balance = async () => {
    const [r] = await db.select({ d: sql<string>`coalesce(sum(${schema.journalLines.debit}),0)`, c: sql<string>`coalesce(sum(${schema.journalLines.credit}),0)` })
      .from(schema.journalLines).innerJoin(schema.journalEntries, eq(schema.journalEntries.id, schema.journalLines.entryId)).where(eq(schema.journalEntries.businessId, b.id));
    return [Number(r.d), Number(r.c)];
  };
  try {
    const [sale] = await db.insert(schema.sales).values({ businessId: b.id, date: "2026-03-01", customer: "Blessing Stores", product: "Maize", quantity: 10, unitPrice: 5000, paymentStatus: "Credit" }).returning();
    await postBookRecord(db, b.id, "sales", sale);
    const [party] = await db.select().from(schema.parties).where(eq(schema.parties.sourceId, sale.id));
    assert.equal(party.amount, 50000);
    await recordPartyPayment(db, b.id, party.id, 20000, "2026-03-05", "R1");
    const [after] = await db.select().from(schema.parties).where(eq(schema.parties.id, party.id));
    assert.equal(after.paid, 20000);

    const [p] = await db.insert(schema.purchases).values({ businessId: b.id, date: "2026-03-02", supplier: "Agro Supplies", item: "NPK", quantity: 2, unitCost: 12000, vat: 1800, paymentStatus: "Bank transfer" }).returning();
    await postBookRecord(db, b.id, "purchases", p);
    const cashLines = await db.select().from(schema.cashEntries).where(eq(schema.cashEntries.sourceId, p.id));
    assert.equal(cashLines.length, 1);
    assert.equal(cashLines[0].moneyOut, 25800);

    const [pc] = await db.insert(schema.pettyCash).values({ businessId: b.id, date: "2026-03-03", description: "Top-up and transport", topUp: 10000, amountOut: 3500 }).returning();
    await postBookRecord(db, b.id, "petty", pc);
    const [d, c] = await balance();
    assert.equal(d, c);

    await unpostBookRecord(db, b.id, "purchases", p.id);
    assert.equal((await db.select().from(schema.cashEntries).where(eq(schema.cashEntries.sourceId, p.id))).length, 0);
    const [d2, c2] = await balance();
    assert.equal(d2, c2);
  } finally {
    await db.delete(schema.businesses).where(eq(schema.businesses.id, b.id));
  }
  process.nextTick(() => process.exit(0));
});
