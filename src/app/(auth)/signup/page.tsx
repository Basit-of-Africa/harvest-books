import Link from "next/link";
import { UserPlus } from "lucide-react";
import { Flash } from "@/components/Flash";
import { AuthBanner } from "@/components/Brand";
import { Consent, PASSWORD_HINT } from "@/components/Consent";
import { signUp } from "../actions";

export const metadata = { title: "Create account" };

export default async function Signup({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  return (
    <div className="auth">
      <form className="card" action={signUp}>
        <AuthBanner />
        <div className="body">
          <h1>Create your account</h1>
          <p className="muted small">You become the owner of the business books and can invite your accountant and team later.</p>
          <Flash ok={sp.ok} err={sp.err} />
          <label className="f" htmlFor="name">Your name<input id="name" name="name" autoComplete="name" required maxLength={120} /></label>
          <label className="f" htmlFor="business">Business name<input id="business" name="business" autoComplete="organization" required maxLength={160} /></label>
          <label className="f" htmlFor="email">Email<input id="email" name="email" type="email" autoComplete="email" required maxLength={254} /></label>
          <label className="f" htmlFor="password">Password<input id="password" name="password" type="password" autoComplete="new-password" minLength={12} maxLength={200} required /><span className="hint">{PASSWORD_HINT}</span></label>
          <Consent />
          <button className="primary" type="submit"><UserPlus />Create account</button>
          <p className="small muted">Already have an account? <Link href="/login">Sign in</Link></p>
        </div>
      </form>
      <p className="foot"><Link href="/privacy">Privacy</Link> · <Link href="/terms">Terms</Link> · Encrypted connection</p>
    </div>
  );
}
