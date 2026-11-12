import Link from "next/link";
import { Sprout } from "lucide-react";
import { APP_NAME, APP_TAGLINE } from "@/lib/brand";

export function Logo() {
  return <span className="logo" aria-hidden="true"><Sprout strokeWidth={2} /></span>;
}

export function Brand({ href = "/dashboard", sub = APP_TAGLINE }: { href?: string; sub?: string }) {
  return (
    <Link href={href} className="brand" aria-label={`${APP_NAME} home`}>
      <Logo />
      <span><b>{APP_NAME}</b><small>{sub}</small></span>
    </Link>
  );
}

/** The dark green card header used on sign-in, sign-up and other standalone pages. */
export function AuthBanner({ sub = APP_TAGLINE }: { sub?: string }) {
  return (
    <div className="banner">
      <span className="tls" title="Connections are encrypted with TLS"><LockIcon />Secure</span>
      <Logo />
      <b>{APP_NAME}</b>
      <small>{sub}</small>
    </div>
  );
}

function LockIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>;
}
