import { Fragment } from "react";
import { and, asc, eq, gt, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { can, requireBusiness } from "@/lib/auth";
import { fmtDate } from "@/lib/format";
import { Flash } from "@/components/Flash";
import { ConfirmButton } from "@/components/ConfirmButton";
import { SubmitButton } from "@/components/SubmitButton";
import { changeRole, inviteMember, removeMember, revokeInvite } from "./actions";

export const metadata = { title: "Team" };

const ROLE_HELP = {
  owner: "Everything, including setup, NRS credentials and the team",
  accountant: "Adds and edits entries, creates, signs and posts e-invoices",
  viewer: "Reads the books and invoices; changes nothing",
};

export default async function Team({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await requireBusiness();
  const sp = await searchParams;
  const owner = can(ctx.role, "owner");
  const [members, invites] = await Promise.all([
    db.select({ m: schema.memberships, u: schema.users }).from(schema.memberships).innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
      .where(eq(schema.memberships.businessId, ctx.business.id)).orderBy(asc(schema.users.name)),
    db.select().from(schema.invites).where(and(eq(schema.invites.businessId, ctx.business.id), isNull(schema.invites.acceptedAt), gt(schema.invites.expiresAt, new Date()))),
  ]);
  return (
    <div className="wrap">
      <div className="head"><div className="titles"><h1>Team</h1><p className="lede">Who can see and change the books for {ctx.business.name}.</p></div></div>
      <Flash ok={sp.ok} err={sp.err} />
      {sp.link && <div className="note">Invitation link: <b style={{ overflowWrap: "anywhere" }}>{sp.link.startsWith("http") ? sp.link : `(your app address)${sp.link}`}</b></div>}
      <section className="panel flush"><div className="tbl"><table>
        <thead><tr><th>Name</th><th>Email</th><th>Role</th>{owner && <th />}</tr></thead>
        <tbody>{members.map(({ m, u }) => (
          <tr key={u.id}><td>{u.name}{u.id === ctx.user.id && <span className="hint"> (you)</span>}</td><td>{u.email}</td>
            <td>{owner ? (
              <form action={changeRole} className="row"><input type="hidden" name="userId" value={u.id} />
                <select name="role" defaultValue={m.role} aria-label={`Role for ${u.name}`} style={{ width: "auto" }}>{Object.keys(ROLE_HELP).map((r) => <option key={r}>{r}</option>)}</select>
                <SubmitButton className="ghost">Save</SubmitButton></form>) : m.role}</td>
            {owner && <td className="act">{u.id !== ctx.user.id && <form action={removeMember}><input type="hidden" name="userId" value={u.id} /><ConfirmButton confirmLabel="Confirm remove">Remove</ConfirmButton></form>}</td>}
          </tr>))}</tbody></table></div></section>
      {owner && (
        <section className="panel">
          <div className="panel-h"><h2>Invite someone</h2></div>
          <form action={inviteMember} className="row" style={{ alignItems: "flex-end" }}>
            <label className="f" htmlFor="i-email" style={{ flex: "1 1 240px" }}>Email<input id="i-email" name="email" type="email" required /></label>
            <label className="f" htmlFor="i-role" style={{ width: 180 }}>Role<select id="i-role" name="role" defaultValue="accountant">{Object.keys(ROLE_HELP).map((r) => <option key={r}>{r}</option>)}</select></label>
            <SubmitButton pendingLabel="Inviting…">Send invitation</SubmitButton>
          </form>
          <dl className="kv" style={{ marginTop: 14 }}>{Object.entries(ROLE_HELP).map(([r, h]) => <Fragment key={r}><dt><b style={{ color: "var(--ink)" }}>{r}</b></dt><dd style={{ fontWeight: 400, textAlign: "left" }}>{h}</dd></Fragment>)}</dl>
          {invites.length > 0 && <div className="tbl" style={{ marginTop: 14 }}><table><thead><tr><th>Waiting for</th><th>Role</th><th>Expires</th><th /></tr></thead>
            <tbody>{invites.map((i) => <tr key={i.id}><td>{i.email}</td><td>{i.role}</td><td className="d">{fmtDate(i.expiresAt)}</td>
              <td className="act"><form action={revokeInvite}><input type="hidden" name="id" value={i.id} /><ConfirmButton confirmLabel="Confirm withdraw">Withdraw</ConfirmButton></form></td></tr>)}</tbody></table></div>}
        </section>
      )}
    </div>
  );
}
