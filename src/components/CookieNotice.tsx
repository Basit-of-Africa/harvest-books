"use client";
import { useState } from "react";
import Link from "next/link";

/**
 * FarmTrace sets only strictly necessary cookies (sign-in session) and two preference cookies
 * (theme, and this notice being dismissed). No analytics, advertising or third-party cookies,
 * so no consent is required under the NDPA, GDPR or the ePrivacy rules; this notice is information only.
 */
export function CookieNotice() {
  const [shown, setShown] = useState(true);
  if (!shown) return null;
  function dismiss() {
    document.cookie = `ft_notice=1; path=/; max-age=31536000; samesite=lax${location.protocol === "https:" ? "; secure" : ""}`;
    setShown(false);
  }
  return (
    <div className="cookie" role="region" aria-label="Cookie notice">
      <p>We use only the cookies needed to keep you signed in and remember your theme. No tracking or advertising cookies. <Link href="/privacy#cookies">Cookie details</Link></p>
      <button type="button" onClick={dismiss}>OK</button>
    </div>
  );
}
