"use server";
import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { newToken, requireBusiness, sha256, type Role } from "@/lib/auth";
import { back, str } from "@/lib/flash";
import { mailConfigured, sendMail } from "@/lib/mail";
import { audit } from "@/lib/security";

const ROLES: Role[] = ["owner", "accountant", "viewer"];

export async function inviteMember(fd: FormData) {
  const ctx = await requireBusiness("owner");
  const email = str(fd, "email").toLowerCase(), role = str(fd, "role") as Role;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) back("/team", "err", "Enter a valid email address.");
  if (!ROLES.includes(role)) back("/team", "err", "Choose a role.");
  const [{ pending }] = await db.select({ pending: sql<number>`count(*)::int` }).from(schema.invites).where(and(eq(schema.invites.businessId, ctx.business.id), sql`${schema.invites.acceptedAt} is null`, sql`${schema.invites.expiresAt} > now()`));
  if (pending >= 50) back("/team", "err", "There are already 50 open invitations. Withdraw some first.");
  const token = newToken();
  await audit({ action: "team.invite", userId: ctx.user.id, businessId: ctx.business.id, meta: { role } });
  await db.insert(schema.invites).values({ businessId: ctx.business.id, email, role, tokenHash: sha256(token), invitedBy: ctx.user.id, expiresAt: new Date(Date.now() + 14 * 864e5) });
  const base = process.env.APP_URL?.replace(/\/$/, "") ?? "";
  const link = `${base}/invite/${token}`;
  let sent = false;
  if (mailConfigured() && base) {
    try {
      await sendMail({ to: email, subject: `${ctx.user.name} invited you to ${ctx.business.name} on FarmTrace`,
        text: `${ctx.user.name} has invited you to keep the books for ${ctx.business.name} as ${role === "accountant" ? "an accountant" : `a ${role}`}.\n\nAccept the invitation: ${link}\n\nThe link works for 14 days.` });
      sent = true;
    } catch { /* fall back to showing the link */ }
  }
  revalidatePath("/team");
  back("/team", "ok", sent ? `Invitation emailed to ${email}.` : `Invitation created. Send ${email} this link; it works for 14 days.`, sent ? {} : { link });
}

export async function changeRole(fd: FormData) {
  const ctx = await requireBusiness("owner");
  const userId = str(fd, "userId"), role = str(fd, "role") as Role;
  if (!ROLES.includes(role)) back("/team", "err", "Choose a role.");
  if (userId === ctx.user.id && role !== "owner") {
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.memberships).where(and(eq(schema.memberships.businessId, ctx.business.id), eq(schema.memberships.role, "owner")));
    if (n < 2) back("/team", "err", "Make someone else an owner before changing your own role.");
  }
  await db.update(schema.memberships).set({ role }).where(and(eq(schema.memberships.businessId, ctx.business.id), eq(schema.memberships.userId, userId)));
  await audit({ action: "team.role_changed", userId: ctx.user.id, businessId: ctx.business.id, target: userId, meta: { role } });
  back("/team", "ok", "Role updated.");
}

export async function removeMember(fd: FormData) {
  const ctx = await requireBusiness("owner");
  const userId = str(fd, "userId");
  if (userId === ctx.user.id) back("/team", "err", "You cannot remove yourself.");
  await db.delete(schema.memberships).where(and(eq(schema.memberships.businessId, ctx.business.id), eq(schema.memberships.userId, userId)));
  // Sessions pointed at this business fall back to the person's other businesses on their next request.
  await db.update(schema.sessions).set({ businessId: null }).where(and(eq(schema.sessions.userId, userId), eq(schema.sessions.businessId, ctx.business.id)));
  await audit({ action: "team.member_removed", userId: ctx.user.id, businessId: ctx.business.id, target: userId });
  back("/team", "ok", "Removed from this business.");
}

export async function revokeInvite(fd: FormData) {
  const ctx = await requireBusiness("owner");
  await db.delete(schema.invites).where(and(eq(schema.invites.businessId, ctx.business.id), eq(schema.invites.id, str(fd, "id"))));
  await audit({ action: "team.invite_revoked", userId: ctx.user.id, businessId: ctx.business.id });
  back("/team", "ok", "Invitation withdrawn.");
}
