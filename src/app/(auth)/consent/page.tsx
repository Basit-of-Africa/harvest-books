import Link from "next/link";
import { redirect } from "next/navigation";
import { getCtx } from "@/lib/auth";
import { POLICY_VERSION } from "@/lib/brand";
import { Flash } from "@/components/Flash";
import { AuthBanner } from "@/components/Brand";
import { Consent } from "@/components/Consent";
import { acceptTerms, signOut } from "../actions";

export const metadata = { title: "Updated terms" };

export default async function ConsentPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await getCtx();
  if (!ctx) redirect("/login");
  if (ctx.user.termsVersion === POLICY_VERSION) redirect("/dashboard");
  const sp = await searchParams;
  return (
    <div className="auth">
      <div className="card">
        <AuthBanner />
        <div className="body">
          <h1>{ctx.user.termsVersion ? "Our terms have changed" : "Please review our terms"}</h1>
          <p className="muted small">We have updated how we describe the way FarmTrace protects and processes your data, in line with the Nigeria Data Protection Act 2023 and the GDPR. Please read the <Link href="/privacy" target="_blank">Privacy Policy</Link> and <Link href="/terms" target="_blank">Terms of Service</Link> before carrying on.</p>
          <Flash ok={sp.ok} err={sp.err} />
          <form action={acceptTerms} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Consent />
            <button className="primary" type="submit">Accept and continue</button>
          </form>
          <p className="small muted">If you don&apos;t agree, you can <Link href="/account">download your data or close your account</Link> after signing in, or <a href={`mailto:${process.env.PRIVACY_EMAIL || "privacy@farmtrace.ng"}`}>contact us</a>.</p>
          <form action={signOut}><button className="ghost" type="submit">Sign out</button></form>
        </div>
      </div>
    </div>
  );
}
