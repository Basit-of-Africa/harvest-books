import "server-only";
import { createHmac } from "node:crypto";
import { headers } from "next/headers";
import { and, eq, gt, sql } from "drizzle-orm";
import { db, schema } from "@/db";

/* ---------- request facts ---------- */

/** Client IP from the platform's forwarding header (Vercel sets x-forwarded-for / x-real-ip). */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get("x-real-ip") || h.get("x-forwarded-for")?.split(",")[0] || "").trim();
}

export async function userAgent(): Promise<string> {
  return ((await headers()).get("user-agent") ?? "").slice(0, 200);
}

/**
 * Keyed hash so IPs are never stored in the clear (data minimisation under the NDPA 2023 and GDPR art. 5(1)(c)),
 * while repeated attempts from one address can still be counted.
 */
export function keyedHash(value: string): string {
  const secret = process.env.ENCRYPTION_KEY || process.env.AUTH_SECRET || "farmtrace-dev-only";
  return createHmac("sha256", secret).update(value).digest("hex").slice(0, 40);
}

export async function ipHash(): Promise<string> {
  const ip = await clientIp();
  return ip ? keyedHash("ip:" + ip) : "";
}

/* ---------- passwords ---------- */

const COMMON = new Set([
  "password", "password1", "password123", "123456789012", "qwertyuiop", "iloveyou", "welcome", "admin", "letmein",
  "111111111111", "000000000000", "abcdefghijkl", "passwordpassword", "qwerty123456", "123412341234", "farmtrace",
  "nigeria", "lagos", "abuja", "naira", "changeme", "monkey", "dragon", "football", "sunshine",
]);

/** Returns the reason a password is not acceptable, or null. NIST SP 800-63B style: length over complexity rules. */
export function passwordProblem(password: string, email = "", name = ""): string | null {
  if (password.length < 12) return "Use a password of at least 12 characters. A short sentence works well.";
  if (Buffer.byteLength(password, "utf8") > 72) return "That password is too long. Use at most 72 characters.";
  const lower = password.toLowerCase();
  if (COMMON.has(lower) || COMMON.has(lower.replace(/[^a-z]/g, ""))) return "That password is too common. Choose something less guessable.";
  if (/^(.)\1+$/.test(password)) return "Don't use one character repeated.";
  const local = email.split("@")[0]?.toLowerCase();
  if (local && local.length >= 4 && lower.includes(local)) return "Don't include your email address in your password.";
  const first = name.split(/\s+/)[0]?.toLowerCase();
  if (first && first.length >= 4 && lower.includes(first) && lower.length - first.length < 8) return "Don't base your password on your name.";
  return null;
}

/* ---------- rate limiting (database-backed, so it holds across serverless instances) ---------- */

export const LIMITS = {
  /** failed sign-ins for one email before it is locked */
  emailFailures: 5,
  /** lockout length after too many failures */
  lockMinutes: 15,
  /** sign-in attempts from one IP in the window */
  ipAttempts: 30,
  /** new accounts from one IP in an hour */
  ipSignups: 10,
  windowMinutes: 15,
};

export async function countRecent(key: string, minutes: number, onlyFailures = false): Promise<number> {
  const since = new Date(Date.now() - minutes * 60_000);
  const where = onlyFailures
    ? and(eq(schema.authAttempts.key, key), gt(schema.authAttempts.createdAt, since), eq(schema.authAttempts.ok, false))
    : and(eq(schema.authAttempts.key, key), gt(schema.authAttempts.createdAt, since));
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.authAttempts).where(where);
  return n;
}

export async function recordAttempt(key: string, ok: boolean) {
  await db.insert(schema.authAttempts).values({ key, ok });
}

/* ---------- audit log ---------- */

export type AuditAction =
  | "auth.signin" | "auth.signin_failed" | "auth.locked" | "auth.signout" | "auth.signup" | "auth.password_changed"
  | "auth.sessions_revoked" | "auth.session_revoked" | "auth.consent"
  | "team.invite" | "team.invite_revoked" | "team.role_changed" | "team.member_removed" | "team.joined" | "team.left"
  | "business.created" | "business.updated" | "business.deleted" | "nrs.credentials_saved" | "nrs.credentials_cleared"
  | "invoice.validated" | "invoice.signed" | "invoice.transmitted" | "invoice.deleted" | "invoice.emailed"
  | "data.export_book" | "data.export_account" | "data.export_business" | "account.deleted" | "account.updated";

/** Never pass secrets or more personal data than needed in `meta`. Failures to log never block the action. */
export async function audit(e: { action: AuditAction; userId?: string | null; businessId?: string | null; target?: string; meta?: Record<string, unknown> }) {
  try {
    await db.insert(schema.auditLogs).values({
      action: e.action, userId: e.userId ?? null, businessId: e.businessId ?? null,
      target: e.target ?? "", meta: e.meta ?? {}, ipHash: await ipHash().catch(() => ""),
    });
  } catch (err) {
    console.error("audit log write failed", (err as Error).message);
  }
}

/* ---------- errors shown to people ---------- */

/**
 * Turns an error into a message safe to show. Database and driver errors can contain SQL, table names
 * and values, so they are replaced with a plain sentence and logged on the server instead.
 */
export function publicMessage(e: unknown): string {
  const err = e as { message?: string; code?: string; cause?: { code?: string } } | null;
  const code = err?.code ?? err?.cause?.code;
  const msg = err?.message ? String(err.message) : "";
  if (code === "23505") return "That record already exists (duplicate).";
  if (code === "23503") return "That record is still in use elsewhere, so it can't be changed this way.";
  if ((typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)) || /^Failed query/i.test(msg) || /ECONNREFUSED|ETIMEDOUT|relation ".*" does not exist/i.test(msg)) {
    return "Something went wrong saving that. Please try again.";
  }
  return msg || "Something went wrong. Please try again.";
}
