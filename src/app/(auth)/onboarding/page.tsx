import { redirect } from "next/navigation";
import { getCtx } from "@/lib/auth";
import { Flash } from "@/components/Flash";
import { createBusiness, signOut } from "../actions";

export const metadata = { title: "Add a business" };

export default async function Onboarding({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await getCtx();
  if (!ctx) redirect("/login");
  const sp = await searchParams;
  return (
    <div className="auth">
      <div className="card panel">
        <div className="brand"><b>Harvest Books</b></div>
        <h1 style={{ fontSize: 26 }}>Add a business</h1>
        <p className="muted small">Each business keeps its own books, invoices and NRS connection. You will be its owner.</p>
        <Flash ok={sp.ok} err={sp.err} />
        <form action={createBusiness} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label className="f" htmlFor="business">Business name<input id="business" name="business" required /></label>
          <button className="primary" type="submit">Create business</button>
        </form>
        <form action={signOut}><button className="ghost" type="submit">Sign out</button></form>
      </div>
    </div>
  );
}
