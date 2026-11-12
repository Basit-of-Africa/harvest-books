"use server";
import { redirect } from "next/navigation";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { dummyHash, endSession, getCtx, hashPassword, sha256, startSession, verifyPassword } from "@/lib/auth";
import { seedChart } from "@/lib/accounts";
import { back, str } from "@/lib/flash";
import { POLICY_VERSION } from "@/lib/brand";
import { LIMITS, audit, countRecent, ipHash, keyedHash, passwordProblem, recordAttempt } from "@/lib/security";

const emailOk = (e: string) => e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
const TOO_MANY = `Too many sign-in attempts. Wait ${LIMITS.lockMinutes} minutes and try again.`;

async function validInvite(token: string) {
  if (!token || token.length > 100) return null;
  const [inv] = await db.select().from(schema.invites)
    .where(and(eq(schema.invites.tokenHash, sha256(token)), isNull(schema.invites.acceptedAt), gt(schema.invites.expiresAt, new Date()))).limit(1);
  return inv ?? null;
}

export async function signUp(fd: FormData) {
  const name = str(fd, "name").slice(0, 120), email = str(fd, "email").toLowerCase(), password = String(fd.get("password") ?? "");
  const businessName = str(fd, "business").slice(0, 160), token = str(fd, "invite");
  const here = token ? `/invite/${token}` : "/signup";
  const ipKey = "su:" + (await ipHash());
  if ((await countRecent(ipKey, 60)) >= LIMITS.ipSignups) back(here, "err", "Too many new accounts from this network. Try again in an hour.");
  if (!name) back(here, "err", "Add your name.");
  if (!emailOk(email)) back(here, "err", "Enter a valid email address.");
  const weak = passwordProblem(password, email, name);
  if (weak) back(here, "err", weak);
  if (fd.get("consent") !== "on") back(here, "err", "Please confirm you are 18 or older and accept the Terms and Privacy Policy.");
  const invite = await validInvite(token);
  if (token && !invite) back("/signup", "err", "That invitation has expired or was already used. Ask for a new one.");
  if (invite && invite.email.toLowerCase() !== email) back(here, "err", `This invitation is for ${invite.email}. Sign up with that address.`);
  if (!invite && !businessName) back(here, "err", "Add your business name.");
  await recordAttempt(ipKey, true);
  const [exists] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, email)).limit(1);
  if (exists) back("/login", "err", "An account with that email already exists. Sign in instead.");

  const passwordHash = await hashPassword(password);
  const now = new Date();
  const { userId, businessId } = await db.transaction(async (tx) => {
    const [u] = await tx.insert(schema.users).values({ name, email, passwordHash, termsVersion: POLICY_VERSION, termsAcceptedAt: now, passwordChangedAt: now }).returning({ id: schema.users.id });
    if (invite) {
      await tx.insert(schema.memberships).values({ userId: u.id, businessId: invite.businessId, role: invite.role });
      await tx.update(schema.invites).set({ acceptedAt: now }).where(eq(schema.invites.id, invite.id));
      return { userId: u.id, businessId: invite.businessId };
    }
    const [b] = await tx.insert(schema.businesses).values({ name: businessName, email }).returning({ id: schema.businesses.id });
    await tx.insert(schema.memberships).values({ userId: u.id, businessId: b.id, role: "owner" });
    await seedChart(tx, b.id);
    return { userId: u.id, businessId: b.id };
  });
  await audit({ action: "auth.signup", userId, businessId, meta: { policy: POLICY_VERSION, invited: !!invite } });
  if (invite) await audit({ action: "team.joined", userId, businessId, meta: { role: invite.role } });
  else await audit({ action: "business.created", userId, businessId });
  await startSession(userId, businessId);
  redirect(invite ? "/dashboard" : "/settings?ok=" + encodeURIComponent("Welcome. Add your TIN and NRS details to start e-invoicing."));
}

export async function signIn(fd: FormData) {
  const email = str(fd, "email").toLowerCase().slice(0, 254), password = String(fd.get("password") ?? "").slice(0, 200);
  const ip = await ipHash();
  const ipKey = "ip:" + ip, emailKey = "em:" + keyedHash(email);
  // Per-network and per-email limits. The email limit applies whether or not an account exists, so it reveals nothing.
  if ((await countRecent(ipKey, LIMITS.windowMinutes)) >= LIMITS.ipAttempts) back("/login", "err", TOO_MANY);
  if ((await countRecent(emailKey, LIMITS.lockMinutes, true)) >= LIMITS.emailFailures) back("/login", "err", TOO_MANY);

  const [u] = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
  const ok = u ? await verifyPassword(password, u.passwordHash) : (await verifyPassword(password, await dummyHash()), false);
  await recordAttempt(ipKey, ok);
  if (!ok) {
    await recordAttempt(emailKey, false);
    if (u) {
      const failures = u.failedLogins + 1;
      const locked = failures % LIMITS.emailFailures === 0;
      await db.update(schema.users).set({ failedLogins: failures, lockedUntil: locked ? new Date(Date.now() + LIMITS.lockMinutes * 60_000) : u.lockedUntil }).where(eq(schema.users.id, u.id));
      await audit({ action: locked ? "auth.locked" : "auth.signin_failed", userId: u.id, meta: { failures } });
    }
    back("/login", "err", "That email and password do not match.");
  }
  await db.delete(schema.authAttempts).where(eq(schema.authAttempts.key, emailKey));
  await db.update(schema.users).set({ failedLogins: 0, lockedUntil: null }).where(eq(schema.users.id, u.id));
  const [m] = await db.select({ b: schema.memberships.businessId }).from(schema.memberships).where(eq(schema.memberships.userId, u.id)).limit(1);
  await endSession(); // never reuse a session token from before sign-in
  await startSession(u.id, m?.b ?? null);
  await audit({ action: "auth.signin", userId: u.id, businessId: m?.b ?? null });
  redirect(m ? "/dashboard" : "/onboarding");
}

export async function signOut() {
  const ctx = await getCtx();
  await endSession();
  if (ctx) await audit({ action: "auth.signout", userId: ctx.user.id, businessId: ctx.business?.id ?? null });
  redirect("/login?ok=" + encodeURIComponent("You are signed out."));
}

/** For people who signed up under an older policy version. */
export async function acceptTerms(fd: FormData) {
  const ctx = await getCtx();
  if (!ctx) redirect("/login");
  if (fd.get("consent") !== "on") back("/consent", "err", "Please tick the box to continue.");
  await db.update(schema.users).set({ termsVersion: POLICY_VERSION, termsAcceptedAt: new Date() }).where(eq(schema.users.id, ctx.user.id));
  await audit({ action: "auth.consent", userId: ctx.user.id, meta: { policy: POLICY_VERSION } });
  redirect("/dashboard");
}

export async function createBusiness(fd: FormData) {
  const ctx = await getCtx();
  if (!ctx) redirect("/login");
  const name = str(fd, "business").slice(0, 160);
  if (!name) back("/onboarding", "err", "Add the business name.");
  if (ctx.memberships.filter((m) => m.role === "owner").length >= 25) back("/onboarding", "err", "You already own 25 businesses. Contact support to add more.");
  const id = await db.transaction(async (tx) => {
    const [b] = await tx.insert(schema.businesses).values({ name, email: ctx.user.email }).returning({ id: schema.businesses.id });
    await tx.insert(schema.memberships).values({ userId: ctx.user.id, businessId: b.id, role: "owner" });
    await seedChart(tx, b.id);
    return b.id;
  });
  await db.update(schema.sessions).set({ businessId: id }).where(eq(schema.sessions.id, ctx.sessionId));
  await audit({ action: "business.created", userId: ctx.user.id, businessId: id });
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
  if (!ctx) redirect(`/invite/${encodeURIComponent(token)}`);
  const invite = await validInvite(token);
  if (!invite) back("/dashboard", "err", "That invitation has expired or was already used.");
  if (invite.email.toLowerCase() !== ctx.user.email.toLowerCase()) back(`/invite/${encodeURIComponent(token)}`, "err", `This invitation is for ${invite.email}. Sign in with that account.`);
  await db.insert(schema.memberships).values({ userId: ctx.user.id, businessId: invite.businessId, role: invite.role }).onConflictDoNothing();
  await db.update(schema.invites).set({ acceptedAt: new Date() }).where(eq(schema.invites.id, invite.id));
  await db.update(schema.sessions).set({ businessId: invite.businessId }).where(eq(schema.sessions.id, ctx.sessionId));
  await audit({ action: "team.joined", userId: ctx.user.id, businessId: invite.businessId, meta: { role: invite.role } });
  redirect("/dashboard");
}
