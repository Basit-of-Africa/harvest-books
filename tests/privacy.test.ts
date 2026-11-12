/** Integration test: needs DATABASE_URL pointing at a migrated, disposable database. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { getDb, schema } from "../src/db";
import { seedChart } from "../src/lib/accounts";
import { deleteAccount, exportBusinessData, exportPersonalData, planAccountDeletion, purgeExpired } from "../src/lib/privacy";

const skip = !process.env.DATABASE_URL;

test("export, erasure and retention", { skip }, async () => {
  const db = getDb();
  const stamp = Date.now();
  const [owner] = await db.insert(schema.users).values({ name: "Owner", email: `owner${stamp}@t.ng`, passwordHash: "x", termsVersion: "v1" }).returning();
  const [helper] = await db.insert(schema.users).values({ name: "Helper", email: `helper${stamp}@t.ng`, passwordHash: "x" }).returning();
  const [solo] = await db.insert(schema.businesses).values({ name: "Solo farm", nrsCredentials: "secret-blob" }).returning();
  const [shared] = await db.insert(schema.businesses).values({ name: "Shared farm" }).returning();
  await seedChart(db, solo.id);
  await db.insert(schema.memberships).values([
    { userId: owner.id, businessId: solo.id, role: "owner" },
    { userId: owner.id, businessId: shared.id, role: "owner" },
    { userId: helper.id, businessId: shared.id, role: "accountant" },
  ]);
  await db.insert(schema.payroll).values({ businessId: solo.id, date: "2026-01-05", staffName: "Musa", daysWorked: 3, rate: 2000 });
  await db.insert(schema.auditLogs).values({ userId: owner.id, businessId: solo.id, action: "auth.signin" });
  try {
    const mine = await exportPersonalData(owner.id);
    assert.equal(mine.account.email, owner.email);
    assert.equal(mine.memberships.length, 2);
    assert.ok(!("passwordHash" in mine.account));

    const biz = await exportBusinessData(solo.id);
    assert.equal(biz.books.payroll.length, 1);
    assert.equal((biz.business as any).nrsCredentials, undefined, "NRS secrets must never be exported");
    assert.equal(biz.business.nrsCredentialsSaved, true);

    // Sole owner of a business others use: blocked until ownership is handed over.
    let plan = await planAccountDeletion(owner.id);
    assert.deepEqual(plan.blockers.map((b) => b.id), [shared.id]);
    assert.deepEqual(plan.deleteBusinesses.map((b) => b.id), [solo.id]);
    await assert.rejects(deleteAccount(owner.id, plan));

    await db.update(schema.memberships).set({ role: "owner" }).where(eq(schema.memberships.userId, helper.id));
    plan = await planAccountDeletion(owner.id);
    assert.equal(plan.blockers.length, 0);
    await deleteAccount(owner.id, plan);
    assert.equal((await db.select().from(schema.users).where(eq(schema.users.id, owner.id))).length, 0);
    assert.equal((await db.select().from(schema.businesses).where(eq(schema.businesses.id, solo.id))).length, 0, "solo business is erased");
    assert.equal((await db.select().from(schema.payroll).where(eq(schema.payroll.businessId, solo.id))).length, 0, "its staff records go too");
    assert.equal((await db.select().from(schema.businesses).where(eq(schema.businesses.id, shared.id))).length, 1, "shared business stays");
    const logs = await db.select().from(schema.auditLogs).where(eq(schema.auditLogs.action, "auth.signin"));
    assert.ok(logs.every((l) => l.userId !== owner.id), "audit entries are unlinked from the deleted person");

    await db.insert(schema.authAttempts).values({ key: "test", createdAt: new Date(Date.now() - 2 * 864e5) });
    await db.insert(schema.sessions).values({ id: "old" + stamp, userId: helper.id, expiresAt: new Date(Date.now() - 1000) });
    const removed = await purgeExpired();
    assert.ok(removed.authAttempts >= 1 && removed.sessions >= 1);
  } finally {
    await db.delete(schema.businesses).where(eq(schema.businesses.id, shared.id));
    await db.delete(schema.users).where(eq(schema.users.id, helper.id));
  }
});
