import { and, eq, gt, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { getCtx, sha256 } from "@/lib/auth";
import { Flash } from "@/components/Flash";
import { acceptInvite, signUp } from "../../actions";

export const metadata = { title: "Join a business" };

export default async function Invite({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<Record<string, string>> }) {
  const { token } = await params;
  const sp = await searchParams;
  const [row] = await db.select({ i: schema.invites, b: schema.businesses.name }).from(schema.invites)
    .innerJoin(schema.businesses, eq(schema.businesses.id, schema.invites.businessId))
    .where(and(eq(schema.invites.tokenHash, sha256(token)), isNull(schema.invites.acceptedAt), gt(schema.invites.expiresAt, new Date()))).limit(1);
  const ctx = await getCtx();
  return (
    <div className="auth">
      <div className="card panel">
        <div className="brand"><b>Harvest Books</b></div>
        {!row ? (<><h1 style={{ fontSize: 26 }}>This invitation has expired</h1><p className="muted">Ask the business owner to send a new one.</p></>) : (
          <>
            <h1 style={{ fontSize: 26 }}>Join {row.b}</h1>
            <p className="muted small">You have been invited as {row.i.role === "accountant" ? "an accountant" : `a ${row.i.role}`} ({row.i.email}).</p>
            <Flash ok={sp.ok} err={sp.err} />
            {ctx ? (
              <form action={acceptInvite}><input type="hidden" name="invite" value={token} /><button className="primary" type="submit">Join as {ctx.user.email}</button></form>
            ) : (
              <form action={signUp} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <input type="hidden" name="invite" value={token} />
                <label className="f" htmlFor="name">Your name<input id="name" name="name" required /></label>
                <label className="f" htmlFor="email">Email<input id="email" name="email" type="email" defaultValue={row.i.email} required /></label>
                <label className="f" htmlFor="password">Password<input id="password" name="password" type="password" minLength={8} required /></label>
                <button className="primary" type="submit">Create account and join</button>
                <p className="small muted">Already have an account? <a href="/login">Sign in</a>, then open this link again.</p>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
}
