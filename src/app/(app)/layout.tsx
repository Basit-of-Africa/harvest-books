import Link from "next/link";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireBusiness } from "@/lib/auth";
import { NavLink } from "@/components/NavLink";
import { signOut, switchBusiness } from "../(auth)/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireBusiness();
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.invoices)
    .where(and(eq(schema.invoices.businessId, ctx.business.id), inArray(schema.invoices.nrsStatus, ["draft", "validated", "failed"])));
  return (
    <div className="shell">
      <aside className="rail" aria-label="Main navigation">
        <Link href="/dashboard" className="brand"><b>Harvest Books</b><span>{ctx.business.name}</span></Link>
        <nav className="navgroup" aria-label="Overview">
          <NavLink href="/dashboard">Monthly summary</NavLink>
          <NavLink href="/invoices" badge={n}>E-invoices</NavLink>
        </nav>
        <nav className="navgroup" aria-label="Books">
          <h4>Books</h4>
          <NavLink href="/books/cash">Cash book</NavLink>
          <NavLink href="/books/sales">Sales book</NavLink>
          <NavLink href="/books/purchases">Purchases book</NavLink>
          <NavLink href="/books/petty">Petty cash</NavLink>
          <NavLink href="/books/inventory">Inventory</NavLink>
          <NavLink href="/books/payroll">Payroll</NavLink>
          <NavLink href="/books/assets">Asset register</NavLink>
          <NavLink href="/books/parties">Debtors and creditors</NavLink>
        </nav>
        <nav className="navgroup" aria-label="Accounts and setup">
          <h4>Accounts and setup</h4>
          <NavLink href="/accounts">Trial balance</NavLink>
          <NavLink href="/settings">Business and NRS setup</NavLink>
          <NavLink href="/team">Team</NavLink>
        </nav>
        <div className="who">
          <span><b>{ctx.user.name}</b><br /><span className="muted">{ctx.role === "accountant" ? "Accountant" : ctx.role === "owner" ? "Owner" : "Viewer"}</span></span>
          {ctx.memberships.length > 1 && (
            <form action={switchBusiness} className="row">
              <label className="f" htmlFor="biz" style={{ flex: 1 }}>Business
                <select id="biz" name="businessId" defaultValue={ctx.business.id}>
                  {ctx.memberships.map((m) => <option key={m.businessId} value={m.businessId}>{m.name}</option>)}
                </select>
              </label>
              <button type="submit" className="ghost" style={{ alignSelf: "flex-end" }}>Switch</button>
            </form>
          )}
          <div className="row"><Link className="btn ghost" href="/onboarding">Add a business</Link>
            <form action={signOut}><button type="submit" className="ghost">Sign out</button></form></div>
        </div>
      </aside>
      <main id="main">{children}</main>
    </div>
  );
}
