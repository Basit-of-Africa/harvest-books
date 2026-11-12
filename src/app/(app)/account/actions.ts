"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { endSession, hashPassword, requireBusiness, requireUser, revokeSessions, verifyPassword } from "@/lib/auth";
import { back, str } from "@/lib/flash";
import { audit, countRecent, passwordProblem, recordAttempt } from "@/lib/security";
import { deleteAccount, deleteBusiness, planAccountDeletion } from "@/lib/privacy";

const HERE = "/account";

/** Re-checks the password before sensitive changes, with its own brute-force limit. */
async function confirmPassword(userId: string, password: string, where = HERE) {
  const key = "pw:" + userId;
  if ((await countRecent(key, 15, true)) >= 5) back(where, "err", "Too many wrong passwords. Wait 15 minutes and try again.");
  const [u] = await db.select({ h: schema.users.passwordHash }).from(schema.users).where(eq(schema.users.id, userId)).limit(1);
  const ok = !!u && (await verifyPassword(password.slice(0, 200), u.h));
  if (!ok) { await recordAttempt(key, false); back(where, "err", "Your current password is not right."); }
}

export async function updateName(fd: FormData) {
  const ctx = await requireUser();
  const name = str(fd, "name").slice(0, 120);
  if (!name) back(HERE, "err", "Add your name.");
  await db.update(schema.users).set({ name }).where(eq(schema.users.id, ctx.user.id));
  await audit({ action: "account.updated", userId: ctx.user.id, meta: { field: "name" } });
  revalidatePath("/", "layout");
  back(HERE, "ok", "Name updated.");
}

export async function changePassword(fd: FormData) {
  const ctx = await requireUser();
  const current = String(fd.get("current") ?? ""), next = String(fd.get("next") ?? "");
  await confirmPassword(ctx.user.id, current);
  const weak = passwordProblem(next, ctx.user.email, ctx.user.name);
  if (weak) back(HERE, "err", weak);
  if (next === current) back(HERE, "err", "Choose a password different from the current one.");
  await db.update(schema.users).set({ passwordHash: await hashPassword(next), passwordChangedAt: new Date(), failedLogins: 0, lockedUntil: null }).where(eq(schema.users.id, ctx.user.id));
  await revokeSessions(ctx.user.id, ctx.sessionId);
  await audit({ action: "auth.password_changed", userId: ctx.user.id });
  back(HERE, "ok", "Password changed. You have been signed out on every other device.");
}

export async function revokeSession(fd: FormData) {
  const ctx = await requireUser();
  const id = str(fd, "id");
  if (id === ctx.sessionId) back(HERE, "err", "Use Sign out to end this session.");
  await db.delete(schema.sessions).where(and(eq(schema.sessions.id, id), eq(schema.sessions.userId, ctx.user.id)));
  await audit({ action: "auth.session_revoked", userId: ctx.user.id });
  back(HERE, "ok", "That device has been signed out.");
}

export async function revokeOtherSessions() {
  const ctx = await requireUser();
  await revokeSessions(ctx.user.id, ctx.sessionId);
  await audit({ action: "auth.sessions_revoked", userId: ctx.user.id });
  back(HERE, "ok", "Signed out on every other device.");
}

export async function deleteMyAccount(fd: FormData) {
  const ctx = await requireUser();
  if (str(fd, "confirm").toLowerCase() !== ctx.user.email.toLowerCase()) back(HERE + "#close", "err", "Type your email address exactly to confirm.");
  if (fd.get("ack") !== "on") back(HERE + "#close", "err", "Tick the box to confirm you have downloaded the records you need.");
  await confirmPassword(ctx.user.id, String(fd.get("password") ?? ""), HERE + "#close");
  const plan = await planAccountDeletion(ctx.user.id);
  if (plan.blockers.length) back(HERE + "#close", "err", `Make someone else an owner of ${plan.blockers.map((b) => b.name).join(", ")} first, or remove the other members.`);
  for (const b of plan.deleteBusinesses) await audit({ action: "business.deleted", businessId: b.id, meta: { reason: "owner closed account" } });
  await audit({ action: "account.deleted", meta: { businessesDeleted: plan.deleteBusinesses.length } });
  await deleteAccount(ctx.user.id, plan);
  await endSession();
  redirect("/login?ok=" + encodeURIComponent("Your account and its data have been deleted."));
}

export async function deleteThisBusiness(fd: FormData) {
  const ctx = await requireBusiness("owner");
  if (str(fd, "confirm") !== ctx.business.name) back(HERE + "#delete-business", "err", "Type the business name exactly to confirm.");
  if (fd.get("ack") !== "on") back(HERE + "#delete-business", "err", "Tick the box to confirm you have downloaded the records you need.");
  await confirmPassword(ctx.user.id, String(fd.get("password") ?? ""), HERE + "#delete-business");
  await audit({ action: "business.deleted", userId: ctx.user.id, businessId: ctx.business.id, meta: { name: ctx.business.name } });
  await deleteBusiness(ctx.business.id);
  redirect(ctx.memberships.length > 1 ? "/dashboard" : "/onboarding?ok=" + encodeURIComponent("The business and all its records have been deleted."));
}
