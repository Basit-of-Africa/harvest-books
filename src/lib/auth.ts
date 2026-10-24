import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { and, eq, gt } from "drizzle-orm";
import { db, schema } from "@/db";

const COOKIE = "hb_session";
const SESSION_DAYS = 30;
export type Role = "owner" | "accountant" | "viewer";
const RANK: Record<Role, number> = { viewer: 0, accountant: 1, owner: 2 };

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
export const newToken = () => randomBytes(32).toString("base64url");
export const hashPassword = (p: string) => bcrypt.hash(p, 12);
export const verifyPassword = (p: string, h: string) => bcrypt.compare(p, h);

export async function startSession(userId: string, businessId: string | null) {
  const token = newToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 864e5);
  await db.insert(schema.sessions).values({ id: sha256(token), userId, businessId, expiresAt });
  (await cookies()).set(COOKIE, token, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", expires: expiresAt,
  });
}

export async function endSession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await db.delete(schema.sessions).where(eq(schema.sessions.id, sha256(token)));
  jar.delete(COOKIE);
}

export type Ctx = {
  sessionId: string;
  user: { id: string; email: string; name: string };
  business: typeof schema.businesses.$inferSelect | null;
  role: Role | null;
  memberships: { businessId: string; name: string; role: Role }[];
};

/** The signed-in person, their active business and role. Cached per request. */
export const getCtx = cache(async (): Promise<Ctx | null> => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const sid = sha256(token);
  const [row] = await db
    .select({ s: schema.sessions, u: schema.users })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .where(and(eq(schema.sessions.id, sid), gt(schema.sessions.expiresAt, new Date())))
    .limit(1);
  if (!row) return null;
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
    user: { id: row.u.id, email: row.u.email, name: row.u.name },
    business: business ?? null,
    role: (active?.role as Role) ?? null,
    memberships: ms.map((m) => ({ ...m, role: m.role as Role })),
  };
});

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
