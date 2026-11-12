import "server-only";
import { and, desc, eq, inArray, isNotNull, lt, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { APP_NAME, POLICY_VERSION } from "@/lib/brand";

/* ---------- data subject access and portability (NDPA 2023; GDPR arts. 15 and 20) ---------- */

/** Everything held about one person, in a portable, machine-readable form. Password hashes and session tokens are left out. */
export async function exportPersonalData(userId: string) {
  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
  if (!u) throw new Error("Account not found.");
  const memberships = await db.select({ business: schema.businesses.name, businessId: schema.memberships.businessId, role: schema.memberships.role, since: schema.memberships.createdAt })
    .from(schema.memberships).innerJoin(schema.businesses, eq(schema.businesses.id, schema.memberships.businessId)).where(eq(schema.memberships.userId, userId));
  const sessions = await db.select({ started: schema.sessions.createdAt, lastActive: schema.sessions.lastSeenAt, expires: schema.sessions.expiresAt, device: schema.sessions.userAgent })
    .from(schema.sessions).where(eq(schema.sessions.userId, userId));
  const activity = await db.select({ at: schema.auditLogs.createdAt, action: schema.auditLogs.action, businessId: schema.auditLogs.businessId, meta: schema.auditLogs.meta })
    .from(schema.auditLogs).where(eq(schema.auditLogs.userId, userId)).orderBy(desc(schema.auditLogs.createdAt)).limit(5000);
  const invitesSent = await db.select({ email: schema.invites.email, role: schema.invites.role, businessId: schema.invites.businessId, at: schema.invites.createdAt })
    .from(schema.invites).where(eq(schema.invites.invitedBy, userId));
  return {
    exportedAt: new Date().toISOString(),
    service: APP_NAME,
    about: "Personal data FarmTrace holds about you. Business records you keep for a business are exported separately by its owner.",
    account: { id: u.id, name: u.name, email: u.email, createdAt: u.createdAt, passwordLastChanged: u.passwordChangedAt },
    consent: { policyVersion: u.termsVersion, acceptedAt: u.termsAcceptedAt, currentPolicyVersion: POLICY_VERSION },
    memberships, sessions, invitesSent, activity,
  };
}

/** A full copy of one business's books and invoices, for the owner (portability, and keeping tax records after leaving). NRS secrets are never included. */
export async function exportBusinessData(businessId: string) {
  const [b] = await db.select().from(schema.businesses).where(eq(schema.businesses.id, businessId)).limit(1);
  if (!b) throw new Error("Business not found.");
  const { nrsCredentials, ...business } = b;
  const by = <T extends { businessId: unknown }>(t: any) => db.select().from(t).where(eq(t.businessId, businessId)) as Promise<T[]>;
  const entries = await db.select().from(schema.journalEntries).where(eq(schema.journalEntries.businessId, businessId));
  const lines = entries.length ? await db.select().from(schema.journalLines).where(inArray(schema.journalLines.entryId, entries.map((e) => e.id))) : [];
  const team = await db.select({ name: schema.users.name, email: schema.users.email, role: schema.memberships.role })
    .from(schema.memberships).innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId)).where(eq(schema.memberships.businessId, businessId));
  return {
    exportedAt: new Date().toISOString(),
    service: APP_NAME,
    business: { ...business, nrsCredentialsSaved: !!nrsCredentials },
    team,
    chartOfAccounts: await by(schema.accounts),
    journal: entries.map((e) => ({ ...e, lines: lines.filter((l) => l.entryId === e.id) })),
    books: {
      cash: await by(schema.cashEntries), sales: await by(schema.sales), purchases: await by(schema.purchases),
      pettyCash: await by(schema.pettyCash), inventory: await by(schema.inventory), payroll: await by(schema.payroll),
      assets: await by(schema.assets), debtorsAndCreditors: await by(schema.parties),
    },
    customers: await by(schema.customers),
    items: await by(schema.items),
    invoices: await by(schema.invoices),
    nrsCallLog: await by(schema.nrsLogs),
    auditLog: await db.select().from(schema.auditLogs).where(eq(schema.auditLogs.businessId, businessId)).orderBy(desc(schema.auditLogs.createdAt)).limit(10000),
  };
}

/* ---------- erasure (NDPA 2023; GDPR art. 17) ---------- */

export type DeletionPlan = {
  /** Businesses where this person is the only member: deleted with all their records. */
  deleteBusinesses: { id: string; name: string }[];
  /** Businesses where this person is the only owner but others remain: ownership must be handed over first. */
  blockers: { id: string; name: string }[];
};

export async function planAccountDeletion(userId: string): Promise<DeletionPlan> {
  const mine = await db.select({ id: schema.memberships.businessId, role: schema.memberships.role, name: schema.businesses.name })
    .from(schema.memberships).innerJoin(schema.businesses, eq(schema.businesses.id, schema.memberships.businessId)).where(eq(schema.memberships.userId, userId));
  const plan: DeletionPlan = { deleteBusinesses: [], blockers: [] };
  for (const m of mine) {
    const others = await db.select({ role: schema.memberships.role }).from(schema.memberships)
      .where(and(eq(schema.memberships.businessId, m.id), sql`${schema.memberships.userId} <> ${userId}`));
    if (!others.length) plan.deleteBusinesses.push({ id: m.id, name: m.name });
    else if (m.role === "owner" && !others.some((o) => o.role === "owner")) plan.blockers.push({ id: m.id, name: m.name });
  }
  return plan;
}

/** Deletes the person, their sessions and memberships, and any business only they belong to. Audit entries keep no link to them. */
export async function deleteAccount(userId: string, plan: DeletionPlan) {
  if (plan.blockers.length) throw new Error("Hand over ownership first.");
  await db.transaction(async (tx) => {
    if (plan.deleteBusinesses.length) await tx.delete(schema.businesses).where(inArray(schema.businesses.id, plan.deleteBusinesses.map((b) => b.id)));
    await tx.delete(schema.invites).where(eq(schema.invites.invitedBy, userId));
    await tx.delete(schema.users).where(eq(schema.users.id, userId));
  });
}

export async function deleteBusiness(businessId: string) {
  await db.delete(schema.businesses).where(eq(schema.businesses.id, businessId));
}

/* ---------- storage limitation: how long things are kept ---------- */

export const RETENTION = {
  /** Sign-in attempt records used for rate limiting. */
  authAttemptsHours: 24,
  /** Used or expired invitations. */
  invitesDays: 30,
  /** Security and activity log. */
  auditDays: Number(process.env.AUDIT_RETENTION_DAYS) || 730,
  /** Idle sessions (matches the idle timeout in auth.ts) */
  idleSessionHours: 12,
};

/** Removes data past its retention period. Safe to run often; run daily from the cron route or `npm run db:purge`. */
export async function purgeExpired() {
  const now = Date.now();
  const ago = (ms: number) => new Date(now - ms);
  const sessions = await db.delete(schema.sessions)
    .where(or(lt(schema.sessions.expiresAt, new Date(now)), lt(schema.sessions.lastSeenAt, ago(RETENTION.idleSessionHours * 36e5)))).returning({ id: schema.sessions.id });
  const attempts = await db.delete(schema.authAttempts).where(lt(schema.authAttempts.createdAt, ago(RETENTION.authAttemptsHours * 36e5))).returning({ id: schema.authAttempts.id });
  const invites = await db.delete(schema.invites)
    .where(or(lt(schema.invites.expiresAt, ago(RETENTION.invitesDays * 864e5)), and(isNotNull(schema.invites.acceptedAt), lt(schema.invites.acceptedAt, ago(RETENTION.invitesDays * 864e5))))).returning({ id: schema.invites.id });
  const audit = await db.delete(schema.auditLogs).where(lt(schema.auditLogs.createdAt, ago(RETENTION.auditDays * 864e5))).returning({ id: schema.auditLogs.id });
  return { sessions: sessions.length, authAttempts: attempts.length, invites: invites.length, auditLogs: audit.length };
}
