import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { and, eq, gt, lt, ne, or } from "drizzle-orm";
import { db, schema } from "@/db";
import { ipHash, userAgent } from "@/lib/security";

/**
 * Session cookie. In production it carries the __Host- prefix, which makes the browser insist on
 * Secure, Path=/ and no Domain, so a subdomain can never set or overwrite it.
 */
const PROD = process.env.NODE_ENV === "production";
export const SESSION_COOKIE = PROD ? "__Host-ft_session" : "ft_session";
/** Absolute session lifetime. */
const SESSION_DAYS = 14;
/** Signed out after this long without activity. */
const IDLE_HOURS = 12;
/** How often lastSeenAt is refreshed, to avoid a database write on every request. */
const TOUCH_MINUTES = 5;

export type Role = "owner" | "accountant" | "viewer";
const RANK: Record<Role, number> = { viewer: 0, accountant: 1, owner: 2 };

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
export const newToken = () => randomBytes(32).toString("base64url");
export const hashPassword = (p: string) => bcrypt.hash(p, 12);
export const verifyPassword = (p: string, h: string) => bcrypt.compare(p, h);
/** A real bcrypt hash of a random value: checking against it takes as long as a real check, so timing doesn't reveal which emails have accounts. */
let dummy: Promise<string> | null = null;
export const dummyHash = () => (dummy ??= bcrypt.hash(randomBytes(16).toString("hex"), 12));

export async function startSession(userId: string, businessId: string | null) {
  const token = newToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 864e5);
  // Housekeeping: drop this person's expired or idle sessions.
  await db.delete(schema.sessions).where(and(eq(schema.sessions.userId, userId),
    or(lt(schema.sessions.expiresAt, new Date()), lt(schema.sessions.lastSeenAt, new Date(Date.now() - IDLE_HOURS * 36e5)))));
  await db.insert(schema.sessions).values({ id: sha256(token), userId, businessId, expiresAt, userAgent: await userAgent(), ipHash: await ipHash() });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true, sameSite: "lax", secure: PROD, path: "/", expires: expiresAt, priority: "high",
  });
}

export async function endSession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.delete(schema.sessions).where(eq(schema.sessions.id, sha256(token)));
  jar.delete(SESSION_COOKIE);
}

/** Signs a person out everywhere except, optionally, the current session (after a password change, or on request). */
export async function revokeSessions(userId: string, keepSessionId?: string) {
  await db.delete(schema.sessions).where(keepSessionId
    ? and(eq(schema.sessions.userId, userId), ne(schema.sessions.id, keepSessionId))
    : eq(schema.sessions.userId, userId));
}

export type Ctx = {
  sessionId: string;
  user: { id: string; email: string; name: string; termsVersion: string };
  business: typeof schema.businesses.$inferSelect | null;
  role: Role | null;
  memberships: { businessId: string; name: string; role: Role }[];
};

/** The signed-in person, their active business and role. Cached per request. */
export const getCtx = cache(async (): Promise<Ctx | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || token.length > 100) return null;
  const sid = sha256(token);
  const now = Date.now();
  const [row] = await db
    .select({ s: schema.sessions, u: schema.users })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .where(and(eq(schema.sessions.id, sid), gt(schema.sessions.expiresAt, new Date(now)), gt(schema.sessions.lastSeenAt, new Date(now - IDLE_HOURS * 36e5))))
    .limit(1);
  if (!row) return null;
  if (now - row.s.lastSeenAt.getTime() > TOUCH_MINUTES * 60_000) {
    await db.update(schema.sessions).set({ lastSeenAt: new Date(now) }).where(eq(schema.sessions.id, sid));
  }
  const ms = await db
    .select({ businessId: schema.memberships.businessId, role: schema.memberships.role, name: schema.businesses.name })
    .from(schema.memberships)
    .innerJoin(schema.businesses, eq(schema.businesses.id, schema.memberships.businessId))
    .where(eq(schema.memberships.userId, row.u.id))
    .orderBy(schema.businesses.name);
  const active = ms.find((m) => m.businessId === row.s.businessId) ?? ms[0] ?? null;
  let business = null;
  if (active) {
    [business] = await db.select().from(schema.businesses).where(eq(schema.businesses.id, active.businessId)).limit(1);
  }
  return {
    sessionId: sid,
    user: { id: row.u.id, email: row.u.email, name: row.u.name, termsVersion: row.u.termsVersion },
    business: business ?? null,
    role: (active?.role as Role) ?? null,
    memberships: ms.map((m) => ({ ...m, role: m.role as Role })),
  };
});

/** For pages and actions that need a signed-in person but not a business. */
export async function requireUser() {
  const ctx = await getCtx();
  if (!ctx) redirect("/login");
  return ctx;
}

/** For pages and actions: requires sign-in, an active business and at least `min` role. */
export async function requireBusiness(min: Role = "viewer") {
  const ctx = await getCtx();
  if (!ctx) redirect("/login");
  if (!ctx.business || !ctx.role) redirect("/onboarding");
  if (RANK[ctx.role] < RANK[min]) {
    throw new Error(min === "owner" ? "Only the business owner can do this." : "Your role is view-only. Ask the owner for accountant access.");
  }
  return ctx as Ctx & { business: NonNullable<Ctx["business"]>; role: Role };
}

export const can = (role: Role | null, min: Role) => !!role && RANK[role] >= RANK[min];
