import Link from "next/link";
import { Flash } from "@/components/Flash";
import { signIn } from "../actions";

export const metadata = { title: "Sign in" };

export default async function Login({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  return (
    <div className="auth">
      <form className="card panel" action={signIn}>
        <div className="brand"><b>Harvest Books</b><span>Bookkeeping and NRS e-invoicing</span></div>
        <h1 style={{ fontSize: 26 }}>Sign in</h1>
        <Flash ok={sp.ok} err={sp.err} />
        <label className="f" htmlFor="email">Email<input id="email" name="email" type="email" autoComplete="email" required /></label>
        <label className="f" htmlFor="password">Password<input id="password" name="password" type="password" autoComplete="current-password" required /></label>
        <button className="primary" type="submit">Sign in</button>
        <p className="small muted">New here? <Link href="/signup">Create an account for your business</Link></p>
      </form>
    </div>
  );
}
