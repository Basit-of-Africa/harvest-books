import Link from "next/link";
import { LogIn } from "lucide-react";
import { Flash } from "@/components/Flash";
import { AuthBanner } from "@/components/Brand";
import { signIn } from "../actions";

export const metadata = { title: "Sign in" };

export default async function Login({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  return (
    <div className="auth">
      <form className="card" action={signIn}>
        <AuthBanner />
        <div className="body">
          <h1>Sign in</h1>
          <Flash ok={sp.ok} err={sp.err} />
          <label className="f" htmlFor="email">Email<input id="email" name="email" type="email" autoComplete="email" required maxLength={254} /></label>
          <label className="f" htmlFor="password">Password<input id="password" name="password" type="password" autoComplete="current-password" required maxLength={200} /></label>
          <button className="primary" type="submit"><LogIn />Sign in</button>
          <p className="small muted">New here? <Link href="/signup">Create an account for your business</Link></p>
        </div>
      </form>
      <p className="foot"><Link href="/privacy">Privacy</Link> · <Link href="/terms">Terms</Link> · Encrypted connection</p>
    </div>
  );
}
