import { redirect } from "next/navigation";
import { getCtx } from "@/lib/auth";
import { Flash } from "@/components/Flash";
import { AuthBanner } from "@/components/Brand";
import { createBusiness, signOut } from "../actions";

export const metadata = { title: "Add a business" };

export default async function Onboarding({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await getCtx();
  if (!ctx) redirect("/login");
  const sp = await searchParams;
  return (
    <div className="auth">
      <div className="card">
        <AuthBanner />
        <div className="body">
          <h1>Add a business</h1>
          <p className="muted small">Each business keeps its own books, invoices and NRS connection. You will be its owner.</p>
          <Flash ok={sp.ok} err={sp.err} />
          <form action={createBusiness} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <label className="f" htmlFor="business">Business name<input id="business" name="business" required maxLength={160} /></label>
            <button className="primary" type="submit">Create business</button>
          </form>
          <div className="row between">
            {ctx.memberships.length > 0 ? <a className="btn ghost" href="/dashboard">Back to your books</a> : <span />}
            <form action={signOut}><button className="ghost" type="submit">Sign out</button></form>
          </div>
        </div>
      </div>
    </div>
  );
}
