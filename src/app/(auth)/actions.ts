"use server";
import { redirect } from "next/navigation";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { endSession, getCtx, hashPassword, sha256, startSession, verifyPassword } from "@/lib/auth";
import { seedChart } from "@/lib/accounts";
import { back, str } from "@/lib/flash";

const emailOk = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);

async function validInvite(token: string) {
  if (!token) return null;
  const [inv] = await db.select().from(schema.invites)
    .where(and(eq(schema.invites.tokenHash, sha256(token)), isNull(schema.invites.acceptedAt), gt(schema.invites.expiresAt, new Date()))).limit(1);
  return inv ?? null;
}

export async function signUp(fd: FormData) {
  const name = str(fd, "name"), email = str(fd, "email").toLowerCase(), password = String(fd.get("password") ?? "");
  const businessName = str(fd, "business"), token = str(fd, "invite");
  const here = token ? `/invite/${token}` : "/signup";
  if (!name) back(here, "err", "Add your name.");
  if (!emailOk(email)) back(here, "err", "Enter a valid email address.");
  if (password.length < 8) back(here, "err", "Use a password of at least 8 characters.");
  const invite = await validInvite(token);
  if (token && !invite) back("/signup", "err", "That invitation has expired or was already used. Ask for a new one.");
  if (invite && invite.email.toLowerCase() !== email) back(here, "err", `This invitation is for ${invite.email}. Sign up with that address.`);
  if (!invite && !businessName) back(here, "err", "Add your business name.");
  const [exists] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, email)).limit(1);
  if (exists) back("/login", "err", "An account with that email already exists. Sign in instead.");

  const passwordHash = await hashPassword(password);
  const { userId, businessId } = await db.transaction(async (tx) => {
    const [u] = await tx.insert(schema.users).values({ name, email, passwordHash }).returning({ id: schema.users.id });
    if (invite) {
      await tx.insert(schema.memberships).values({ userId: u.id, businessId: invite.businessId, role: invite.role });
      await tx.update(schema.invites).set({ acceptedAt: new Date() }).where(eq(schema.invites.id, invite.id));
      return { userId: u.id, businessId: invite.businessId };
    }
    const [b] = await tx.insert(schema.businesses).values({ name: businessName, email }).returning({ id: schema.businesses.id });
    await tx.insert(schema.memberships).values({ userId: u.id, businessId: b.id, role: "owner" });
    await seedChart(tx, b.id);
    return { userId: u.id, businessId: b.id };
  });
  await startSession(userId, businessId);
  redirect(invite ? "/dashboard" : "/settings?ok=" + encodeURIComponent("Welcome. Add your TIN and NRS details to start e-invoicing."));
}

export async function signIn(fd: FormData) {
  const email = str(fd, "email").toLowerCase(), password = String(fd.get("password") ?? "");
  const [u] = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
  if (!u || !(await verifyPassword(password, u.passwordHash))) back("/login", "err", "That email and password do not match.");
  const [m] = await db.select({ b: schema.memberships.businessId }).from(schema.memberships).where(eq(schema.memberships.userId, u.id)).limit(1);
  await startSession(u.id, m?.b ?? null);
  redirect(m ? "/dashboard" : "/onboarding");
}

export async function signOut() {
  await endSession();
  redirect("/login");
}

export async function createBusiness(fd: FormData) {
  const ctx = await getCtx();
  if (!ctx) redirect("/login");
  const name = str(fd, "business");
  if (!name) back("/onboarding", "err", "Add the business name.");
  const id = await db.transaction(async (tx) => {
    const [b] = await tx.insert(schema.businesses).values({ name, email: ctx.user.email }).returning({ id: schema.businesses.id });
    await tx.insert(schema.memberships).values({ userId: ctx.user.id, businessId: b.id, role: "owner" });
    await seedChart(tx, b.id);
    return b.id;
  });
  await db.update(schema.sessions).set({ businessId: id }).where(eq(schema.sessions.id, ctx.sessionId));
  redirect("/settings?ok=" + encodeURIComponent(`${name} created. Add its TIN and NRS details.`));
}

export async function switchBusiness(fd: FormData) {
  const ctx = await getCtx();
  if (!ctx) redirect("/login");
  const id = str(fd, "businessId");
  if (!ctx.memberships.some((m) => m.businessId === id)) redirect("/dashboard");
  await db.update(schema.sessions).set({ businessId: id }).where(eq(schema.sessions.id, ctx.sessionId));
  redirect("/dashboard");
}

export async function acceptInvite(fd: FormData) {
  const ctx = await getCtx();
  const token = str(fd, "invite");
  if (!ctx) redirect(`/invite/${token}`);
  const invite = await validInvite(token);
  if (!invite) back("/dashboard", "err", "That invitation has expired or was already used.");
  if (invite.email.toLowerCase() !== ctx.user.email.toLowerCase()) back(`/invite/${token}`, "err", `This invitation is for ${invite.email}. Sign in with that account.`);
  await db.insert(schema.memberships).values({ userId: ctx.user.id, businessId: invite.businessId, role: invite.role }).onConflictDoNothing();
  await db.update(schema.invites).set({ acceptedAt: new Date() }).where(eq(schema.invites.id, invite.id));
  await db.update(schema.sessions).set({ businessId: invite.businessId }).where(eq(schema.sessions.id, ctx.sessionId));
  redirect("/dashboard");
}
