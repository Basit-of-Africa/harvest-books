import Link from "next/link";
import { desc, eq, or } from "drizzle-orm";
import { Download, KeyRound, LogOut, MonitorSmartphone, ShieldCheck, Trash2 } from "lucide-react";
import { db, schema } from "@/db";
import { can, requireBusiness } from "@/lib/auth";
import { fmtDate } from "@/lib/format";
import { POLICY_VERSION, PRIVACY_EMAIL } from "@/lib/brand";
import { planAccountDeletion, RETENTION } from "@/lib/privacy";
import { Flash } from "@/components/Flash";
import { ConfirmButton } from "@/components/ConfirmButton";
import { PASSWORD_HINT } from "@/components/Consent";
import { changePassword, deleteMyAccount, deleteThisBusiness, revokeOtherSessions, revokeSession, updateName } from "./actions";

export const metadata = { title: "Privacy and security" };

const ACTION_LABEL: Record<string, string> = {
  "auth.signin": "Signed in", "auth.signin_failed": "Failed sign-in", "auth.locked": "Sign-in locked after failed attempts", "auth.signout": "Signed out",
  "auth.signup": "Account created", "auth.password_changed": "Password changed", "auth.sessions_revoked": "Signed out other devices",
  "auth.session_revoked": "Signed out a device", "auth.consent": "Accepted updated terms", "team.invite": "Invited a team member",
  "team.invite_revoked": "Withdrew an invitation", "team.role_changed": "Changed a team role", "team.member_removed": "Removed a team member",
  "team.joined": "Joined the business", "business.created": "Created the business", "business.updated": "Changed business setup",
  "nrs.credentials_saved": "Saved NRS connection", "nrs.credentials_cleared": "Removed NRS credentials", "invoice.validated": "Validated an invoice with NRS",
  "invoice.signed": "Signed an invoice", "invoice.transmitted": "Transmitted an invoice", "invoice.deleted": "Deleted a draft invoice",
  "invoice.emailed": "Emailed an invoice", "data.export_book": "Exported a book to CSV", "data.export_account": "Downloaded personal data",
  "data.export_business": "Downloaded the business archive", "account.updated": "Updated profile",
};

function device(ua: string) {
  if (!ua) return "Unknown device";
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";
  return os ? `${browser} on ${os}` : browser;
}
const when = (d: Date) => d.toLocaleString("en-NG", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lagos" });

export default async function Account({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await requireBusiness();
  const sp = await searchParams;
  const owner = can(ctx.role, "owner");
  const [me] = await db.select().from(schema.users).where(eq(schema.users.id, ctx.user.id)).limit(1);
  const sessions = await db.select().from(schema.sessions).where(eq(schema.sessions.userId, ctx.user.id)).orderBy(desc(schema.sessions.lastSeenAt));
  const activity = await db.select().from(schema.auditLogs)
    .where(owner ? or(eq(schema.auditLogs.businessId, ctx.business.id), eq(schema.auditLogs.userId, ctx.user.id)) : eq(schema.auditLogs.userId, ctx.user.id))
    .orderBy(desc(schema.auditLogs.createdAt)).limit(40);
  const people = owner ? await db.select({ id: schema.users.id, name: schema.users.name }).from(schema.memberships)
    .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId)).where(eq(schema.memberships.businessId, ctx.business.id)) : [];
  const nameOf = (id: string | null) => (id === ctx.user.id ? "You" : people.find((p) => p.id === id)?.name ?? "Former member");
  const plan = await planAccountDeletion(ctx.user.id);

  return (
    <div className="wrap">
      <div className="head"><div className="titles"><h1>Privacy and security</h1>
        <p className="lede">Your sign-in, the devices using your account, your data protection rights and a record of what has happened on your account{owner ? " and in this business" : ""}.</p></div></div>
      <Flash ok={sp.ok} err={sp.err} />

      <div className="cols">
        <section className="panel">
          <div className="panel-h"><h2><KeyRound size={18} style={{ verticalAlign: -3, marginRight: 8 }} />Your sign-in</h2></div>
          <form action={updateName} className="grid g2" style={{ alignItems: "end", marginBottom: 22 }}>
            <label className="f" htmlFor="name">Name<input id="name" name="name" defaultValue={me.name} maxLength={120} required /></label>
            <label className="f">Email<input value={me.email} readOnly disabled /></label>
            <div className="row span2" style={{ justifyContent: "space-between" }}>
              <span className="hint">To change your email address, write to <a href={`mailto:${PRIVACY_EMAIL}`}>{PRIVACY_EMAIL}</a> from your current address.</span>
              <button type="submit">Save name</button>
            </div>
          </form>
          <form action={changePassword} className="grid g2" style={{ alignItems: "end" }}>
            <label className="f" htmlFor="current">Current password<input id="current" name="current" type="password" autoComplete="current-password" required maxLength={200} /></label>
            <label className="f" htmlFor="next">New password<input id="next" name="next" type="password" autoComplete="new-password" minLength={12} maxLength={200} required /></label>
            <div className="row span2" style={{ justifyContent: "space-between" }}>
              <span className="hint">{PASSWORD_HINT} Changing it signs you out everywhere else.{me.passwordChangedAt ? ` Last changed ${fmtDate(me.passwordChangedAt)}.` : ""}</span>
              <button type="submit" className="primary">Change password</button>
            </div>
          </form>
        </section>

        <section className="panel">
          <div className="panel-h"><h2><ShieldCheck size={18} style={{ verticalAlign: -3, marginRight: 8 }} />How your account is protected</h2></div>
          <ul className="checklist">
            <li><span className="tick on" aria-hidden="true" /><span>Encrypted connection (HTTPS with HSTS) on every page</span></li>
            <li><span className="tick on" aria-hidden="true" /><span>Password stored only as a bcrypt hash</span></li>
            <li><span className="tick on" aria-hidden="true" /><span>Sign-in locked for 15 minutes after 5 wrong passwords</span></li>
            <li><span className="tick on" aria-hidden="true" /><span>Signed out after 12 hours idle, and after 14 days in any case</span></li>
            <li><span className="tick on" aria-hidden="true" /><span>NRS keys encrypted with AES-256-GCM, never shown again</span></li>
            <li><span className="tick on" aria-hidden="true" /><span>No advertising, analytics or tracking cookies</span></li>
          </ul>
          <p className="hint" style={{ marginTop: 14 }}>You accepted the privacy policy and terms version {me.termsVersion || "—"}{me.termsAcceptedAt ? ` on ${fmtDate(me.termsAcceptedAt)}` : ""}{me.termsVersion !== POLICY_VERSION ? " (an update is waiting)" : ""}. <Link href="/privacy">Read the Privacy Policy</Link>.</p>
        </section>
      </div>

      <section className="panel flush">
        <div className="panel-h" style={{ padding: "20px 22px 0" }}>
          <h2><MonitorSmartphone size={18} style={{ verticalAlign: -3, marginRight: 8 }} />Where you&apos;re signed in</h2>
          {sessions.length > 1 && <form action={revokeOtherSessions}><button type="submit"><LogOut />Sign out all other devices</button></form>}
        </div>
        <div className="tbl"><table>
          <thead><tr><th>Device</th><th>Signed in</th><th>Last active</th><th className="r"></th></tr></thead>
          <tbody>{sessions.map((s) => (
            <tr key={s.id}>
              <td>{device(s.userAgent)} {s.id === ctx.sessionId && <span className="chip ok dot">This device</span>}</td>
              <td className="d">{when(s.createdAt)}</td><td className="d">{when(s.lastSeenAt)}</td>
              <td className="act">{s.id !== ctx.sessionId && <form action={revokeSession}><input type="hidden" name="id" value={s.id} /><ConfirmButton confirmLabel="Sign it out">Sign out</ConfirmButton></form>}</td>
            </tr>))}</tbody>
        </table></div>
      </section>

      <section className="panel">
        <div className="panel-h"><h2><Download size={18} style={{ verticalAlign: -3, marginRight: 8 }} />Your data and your rights</h2></div>
        <p className="muted small" style={{ maxWidth: "75ch" }}>Under the Nigeria Data Protection Act 2023, the GDPR and similar laws you can see, correct, move or delete the personal data FarmTrace holds, object to its use, and complain to the Nigeria Data Protection Commission or your local regulator. Most of this is self-service below. For anything else, write to <a href={`mailto:${PRIVACY_EMAIL}`}>{PRIVACY_EMAIL}</a> and we will reply within 30 days.</p>
        <div className="row" style={{ marginTop: 16 }}>
          <a className="btn primary" href="/account/export" download><Download />Download my personal data (JSON)</a>
          {owner && <a className="btn" href="/account/export-business" download><Download />Download all records for {ctx.business.name}</a>}
          <Link className="btn ghost" href="/privacy#rights">About your rights</Link>
        </div>
        <p className="hint" style={{ marginTop: 12 }}>Each book also exports to CSV from its own page. Security records are kept for {Math.round(RETENTION.auditDays / 365)} years, and then deleted automatically.</p>
      </section>

      <section className="panel flush">
        <div className="panel-h" style={{ padding: "20px 22px 0" }}><h2>Recent activity</h2><span className="hint">{owner ? "Your actions and everything in this business" : "Your actions"}, newest first</span></div>
        {activity.length ? (
          <div className="tbl"><table>
            <thead><tr><th>When</th>{owner && <th>Who</th>}<th>What</th></tr></thead>
            <tbody>{activity.map((a) => (
              <tr key={a.id}><td className="d">{when(a.createdAt)}</td>{owner && <td>{nameOf(a.userId)}</td>}
                <td>{ACTION_LABEL[a.action] ?? a.action}{a.action.includes("failed") || a.action.includes("locked") ? <> <span className="chip bad">Check</span></> : null}{typeof a.meta?.number === "string" ? <span className="muted"> · {a.meta.number}</span> : null}{a.target && a.action === "data.export_book" ? <span className="muted"> · {a.target}</span> : null}</td></tr>))}</tbody>
          </table></div>
        ) : <div className="empty">Nothing recorded yet.</div>}
      </section>

      {owner && (
        <section className="panel" id="delete-business" style={{ borderColor: "var(--bad-soft)" }}>
          <div className="panel-h"><h2>Delete {ctx.business.name}</h2></div>
          <div className="note bad" style={{ marginBottom: 14 }}>This permanently deletes the business&apos;s books, invoices, customers, staff payroll records and NRS connection for everyone on the team. Nigerian tax law expects you to keep books and invoices for at least six years, so <a href="/account/export-business">download the full archive</a> first. Invoices already transmitted stay on record with NRS.</div>
          <form action={deleteThisBusiness} className="grid g3" style={{ alignItems: "end" }}>
            <label className="f" htmlFor="bconfirm">Type the business name<input id="bconfirm" name="confirm" autoComplete="off" placeholder={ctx.business.name} required /></label>
            <label className="f" htmlFor="bpassword">Your password<input id="bpassword" name="password" type="password" autoComplete="current-password" required /></label>
            <label className="check"><input type="checkbox" name="ack" required /><span className="small">I have downloaded the records I need to keep.</span></label>
            <div className="row end" style={{ gridColumn: "1 / -1" }}><ConfirmButton className="danger" confirmLabel="Delete the business for good"><Trash2 />Delete business</ConfirmButton></div>
          </form>
        </section>
      )}

      <section className="panel" id="close" style={{ borderColor: "var(--bad-soft)" }}>
        <div className="panel-h"><h2>Close your account</h2></div>
        <p className="muted small" style={{ maxWidth: "75ch" }}>Your sign-in, sessions and memberships are deleted straight away. Records you entered for a business stay with that business, because they belong to its books.</p>
        {plan.deleteBusinesses.length > 0 && <div className="note bad" style={{ marginTop: 12 }}>You are the only member of <b>{plan.deleteBusinesses.map((b) => b.name).join(", ")}</b>, so {plan.deleteBusinesses.length === 1 ? "it" : "they"} will be deleted with all records. Download the archive first if you need to keep the books.</div>}
        {plan.blockers.length > 0 && <div className="note warn" style={{ marginTop: 12 }}>You are the only owner of <b>{plan.blockers.map((b) => b.name).join(", ")}</b>, which other people use. Make one of them an owner on the <Link href="/team">Team</Link> page before closing your account.</div>}
        <form action={deleteMyAccount} className="grid g3" style={{ alignItems: "end", marginTop: 14 }}>
          <label className="f" htmlFor="confirm">Type your email<input id="confirm" name="confirm" type="email" autoComplete="off" placeholder={me.email} required /></label>
          <label className="f" htmlFor="password">Your password<input id="password" name="password" type="password" autoComplete="current-password" required /></label>
          <label className="check"><input type="checkbox" name="ack" required /><span className="small">I have downloaded what I need.</span></label>
          <div className="row end" style={{ gridColumn: "1 / -1" }}><ConfirmButton className="danger" confirmLabel="Close my account for good"><Trash2 />Close account</ConfirmButton></div>
        </form>
      </section>
    </div>
  );
}
