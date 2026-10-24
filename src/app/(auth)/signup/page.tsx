import Link from "next/link";
import { Flash } from "@/components/Flash";
import { signUp } from "../actions";

export const metadata = { title: "Create account" };

export default async function Signup({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  return (
    <div className="auth">
      <form className="card panel" action={signUp}>
        <div className="brand"><b>Harvest Books</b><span>Bookkeeping and NRS e-invoicing</span></div>
        <h1 style={{ fontSize: 26 }}>Create your account</h1>
        <p className="muted small">You become the owner of the business books and can invite your accountant and team later.</p>
        <Flash ok={sp.ok} err={sp.err} />
        <label className="f" htmlFor="name">Your name<input id="name" name="name" autoComplete="name" required /></label>
        <label className="f" htmlFor="business">Business name<input id="business" name="business" autoComplete="organization" required /></label>
        <label className="f" htmlFor="email">Email<input id="email" name="email" type="email" autoComplete="email" required /></label>
        <label className="f" htmlFor="password">Password<input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required /><span className="hint">At least 8 characters</span></label>
        <button className="primary" type="submit">Create account</button>
        <p className="small muted">Already have an account? <Link href="/login">Sign in</Link></p>
      </form>
    </div>
  );
}
