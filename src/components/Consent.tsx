import Link from "next/link";

/** Required at sign-up. The accepted policy version and time are stored on the account (NDPA 2023, GDPR art. 7(1)). */
export function Consent() {
  return (
    <label className="check" htmlFor="consent">
      <input id="consent" name="consent" type="checkbox" required />
      <span className="small">I am 18 or older and I agree to the <Link href="/terms" target="_blank">Terms of Service</Link> and the <Link href="/privacy" target="_blank">Privacy Policy</Link>, including how FarmTrace processes my business records.</span>
    </label>
  );
}

export const PASSWORD_HINT = "At least 12 characters. A short sentence you can remember works well.";
