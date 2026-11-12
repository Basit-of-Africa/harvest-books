import Link from "next/link";
import { APP_NAME, DATA_REGION, LEGAL_ADDRESS, LEGAL_ENTITY, NDPC_REGISTRATION, POLICY_VERSION, PRIVACY_EMAIL } from "@/lib/brand";
import { RETENTION } from "@/lib/privacy";

export const metadata = { title: "Privacy Policy", description: "How FarmTrace collects, uses, protects and shares personal data." };

export default function Privacy() {
  const mail = <a href={`mailto:${PRIVACY_EMAIL}`}>{PRIVACY_EMAIL}</a>;
  return (
    <>
      <h1>Privacy Policy</h1>
      <p className="meta">Version {POLICY_VERSION}. Applies to the {APP_NAME} website and app.</p>
      <p>{APP_NAME} is bookkeeping and NRS e-invoicing software for farms and agribusinesses. This policy explains what personal data we handle, why, how we protect it, and the rights you have. We wrote it to meet the <b>Nigeria Data Protection Act 2023 (NDPA)</b> and the NDPC&apos;s General Application and Implementation Directive, the EU and UK <b>General Data Protection Regulation (GDPR)</b>, and comparable laws such as Ghana&apos;s Data Protection Act, Kenya&apos;s Data Protection Act, South Africa&apos;s POPIA and the California Consumer Privacy Act.</p>

      <h2 id="who">1. Who we are and our role</h2>
      <p>{APP_NAME} is operated by {LEGAL_ENTITY}, {LEGAL_ADDRESS}. You can reach our Data Protection Officer at {mail}.{NDPC_REGISTRATION && <> We are registered with the Nigeria Data Protection Commission under number {NDPC_REGISTRATION}.</>}</p>
      <ul>
        <li><b>We are the data controller</b> for account data: your name, email, password hash, sign-in and security records, and your acceptance of these terms.</li>
        <li><b>We are a data processor</b> for the business records you keep in {APP_NAME}: customers, suppliers, staff and wages, invoices and the rest of your books. The business that owns the books is the controller of that data and decides what goes in it. We process it only to provide the service, under the data processing terms in our <Link href="/terms#dpa">Terms of Service</Link>.</li>
      </ul>

      <h2 id="data">2. What we collect</h2>
      <div className="tbl"><table>
        <thead><tr><th>Data</th><th>Examples</th><th>Where it comes from</th></tr></thead>
        <tbody>
          <tr><td>Account</td><td>Name, email address, password (stored only as a bcrypt hash), role in each business</td><td>You, or the owner who invited you</td></tr>
          <tr><td>Business profile</td><td>Business name, TIN, address, phone, email, bank details, logo, NRS Business and Service IDs</td><td>The business owner</td></tr>
          <tr><td>Business records</td><td>Customer and supplier names, TINs and contact details; staff names, roles, days worked and pay; sales, purchases, assets and balances</td><td>People in the business who keep the books</td></tr>
          <tr><td>E-invoices</td><td>Invoice contents, IRN, QR code, cryptographic stamp, NRS responses</td><td>You and the NRS e-invoicing service</td></tr>
          <tr><td>Security records</td><td>Sign-in times, failed attempts, device type (browser and operating system), a keyed hash of your IP address, actions taken on the account</td><td>Collected automatically when you use the app</td></tr>
          <tr><td>Messages</td><td>Emails you ask us to send, such as invoices and invitations</td><td>You</td></tr>
        </tbody>
      </table></div>
      <p>We do <b>not</b> use advertising, analytics or tracking tools, we don&apos;t build profiles, we make no automated decisions with legal or similar effects on you, and we never sell or rent personal data. We don&apos;t ask for sensitive data such as health, religion or biometrics; please don&apos;t enter it in free-text fields.</p>

      <h2 id="why">3. Why we use it, and our lawful basis</h2>
      <div className="tbl"><table>
        <thead><tr><th>Purpose</th><th>Lawful basis (NDPA 2023 and GDPR art. 6)</th></tr></thead>
        <tbody>
          <tr><td>Create and run your account, keep your books, issue and send invoices</td><td>Performance of a contract with you or your business</td></tr>
          <tr><td>Validate, sign and transmit e-invoices to the Nigeria Revenue Service</td><td>Contract, and the business&apos;s legal obligations under Nigerian tax law</td></tr>
          <tr><td>Keep the service secure: rate-limit sign-ins, detect misuse, keep an audit log</td><td>Legitimate interests in protecting you, your business and the service (balanced against your rights), and our legal duty to keep data secure</td></tr>
          <tr><td>Respond to legal requests, enforce our terms, handle disputes</td><td>Legal obligation and legitimate interests</td></tr>
          <tr><td>Record your acceptance of this policy and the terms</td><td>Consent and contract; you can withdraw consent at any time by closing your account</td></tr>
        </tbody>
      </table></div>

      <h2 id="sharing">4. Who we share it with</h2>
      <ul>
        <li><b>The Nigeria Revenue Service (NRS)</b>, or the Access Point Provider your business chooses, when someone in your business validates, signs or transmits an e-invoice. The invoice includes your business&apos;s and your customer&apos;s details, as the e-invoicing rules require.</li>
        <li><b>People in your business</b> whom the owner invites, according to their role (owner, accountant or viewer).</li>
        <li><b>Our sub-processors</b>, which host and run the service under written data processing agreements: Vercel Inc. (application hosting, United States and global edge network), Neon Inc. (PostgreSQL database, hosted in {DATA_REGION}), and the email provider configured for this deployment (for invoices and invitations you send).</li>
        <li><b>Authorities</b>, when the law requires it and only as much as it requires. We will tell you unless the law forbids it.</li>
        <li><b>A buyer of the business</b>, if {APP_NAME} is sold or merged, under the same protections, with notice to you.</li>
      </ul>

      <h2 id="transfers">5. International transfers</h2>
      <p>Some sub-processors store or handle data outside Nigeria. We transfer personal data abroad only where the NDPA allows it: to a country or organisation the NDPC recognises as providing adequate protection, or with appropriate safeguards such as standard contractual clauses or binding corporate rules approved for this purpose, and with technical protection (encryption in transit and at rest). For people in the EU, EEA and UK we rely on adequacy decisions or the European Commission&apos;s Standard Contractual Clauses (and the UK Addendum). Ask {mail} for a copy of the relevant safeguards.</p>

      <h2 id="retention">6. How long we keep it</h2>
      <div className="tbl"><table>
        <thead><tr><th>Data</th><th>Kept for</th></tr></thead>
        <tbody>
          <tr><td>Account data</td><td>Until you close your account, then deleted straight away</td></tr>
          <tr><td>Business records and invoices</td><td>Until the business owner deletes them or the business. Nigerian tax law expects businesses to keep accounting records for at least six years; owners can download a full archive at any time</td></tr>
          <tr><td>Sign-in sessions</td><td>Ended after {RETENTION.idleSessionHours} hours without activity, and after 14 days in any case</td></tr>
          <tr><td>Sign-in attempt records (for rate limiting)</td><td>{RETENTION.authAttemptsHours} hours</td></tr>
          <tr><td>Used or expired invitations</td><td>{RETENTION.invitesDays} days</td></tr>
          <tr><td>Security and activity log</td><td>{Math.round(RETENTION.auditDays / 365)} years. Entries no longer link to you once your account is deleted</td></tr>
          <tr><td>Backups held by our database host</td><td>Point-in-time backups, kept for no more than 30 days and then overwritten</td></tr>
        </tbody>
      </table></div>
      <p>Expired data is removed automatically by a daily clean-up job.</p>

      <h2 id="security">7. How we protect it</h2>
      <ul>
        <li>Encryption in transit everywhere (HTTPS with HSTS) and encryption at rest by our database host.</li>
        <li>NRS API keys and secrets are encrypted again with AES-256-GCM before storage and are never shown back.</li>
        <li>Passwords are hashed with bcrypt and must be at least 12 characters. Sign-in is rate-limited and locked after repeated failures.</li>
        <li>Sessions use secure, HTTP-only cookies, are tied to the device that signed in, end after inactivity, and can be signed out remotely.</li>
        <li>Role-based access inside each business; every request is checked against the business it touches.</li>
        <li>A strict Content Security Policy and other browser security headers to block cross-site scripting and clickjacking.</li>
        <li>An audit log of sign-ins, exports, team changes, NRS actions and deletions.</li>
        <li>IP addresses are stored only as keyed hashes; we collect no more than the service needs.</li>
      </ul>
      <p id="breach">If a personal data breach is likely to put your rights at risk, we will notify the Nigeria Data Protection Commission within 72 hours of becoming aware of it, tell affected businesses and people without undue delay, and do the same for other regulators where their laws apply.</p>

      <h2 id="rights">8. Your rights</h2>
      <p>Depending on where you live, you have the right to:</p>
      <ul>
        <li><b>Be informed</b> about how your data is used (this policy).</li>
        <li><b>Access</b> your personal data and get a copy: use <Link href="/account">Download my personal data</Link>.</li>
        <li><b>Correct</b> inaccurate data: edit your name on the account page, or ask us.</li>
        <li><b>Delete</b> your data: use <Link href="/account#close">Close your account</Link>.</li>
        <li><b>Data portability</b>: your data and your business&apos;s books export as JSON and CSV.</li>
        <li><b>Restrict or object</b> to processing based on legitimate interests.</li>
        <li><b>Withdraw consent</b> at any time, without affecting processing that happened before.</li>
        <li>Not be subject to <b>automated decisions</b> with legal effects (we make none).</li>
        <li>For California residents: know, delete and correct, and not be discriminated against for using these rights. We do not sell or share personal information for cross-context advertising.</li>
        <li><b>Complain</b> to a regulator: in Nigeria the Nigeria Data Protection Commission (<a href="https://ndpc.gov.ng" target="_blank" rel="noopener noreferrer">ndpc.gov.ng</a>); in the EU/EEA your local supervisory authority; in the UK the Information Commissioner&apos;s Office.</li>
      </ul>
      <p>Write to {mail} for anything you can&apos;t do yourself in the app. We reply within 30 days and may need to confirm your identity first. If your request is about records a business keeps about you (for example as its customer or employee), we will pass it to that business, as the controller, and help it respond.</p>

      <h2 id="children">9. Children</h2>
      <p>{APP_NAME} is for businesses and is not meant for anyone under 18. We don&apos;t knowingly collect children&apos;s data. If you believe a child has signed up, contact {mail} and we will delete the account.</p>

      <h2 id="cookies">10. Cookies</h2>
      <p>We use only first-party cookies that the service needs. There are no analytics, advertising or third-party cookies, and fonts are served from our own domain, so your visit isn&apos;t shared with font or tracking providers.</p>
      <div className="tbl"><table>
        <thead><tr><th>Cookie</th><th>Purpose</th><th>Type</th><th>Lasts</th></tr></thead>
        <tbody>
          <tr><td><code>__Host-ft_session</code></td><td>Keeps you signed in. Holds a random token, never your password</td><td>Strictly necessary</td><td>Up to 14 days, ends earlier on sign-out or inactivity</td></tr>
          <tr><td><code>ft_theme</code></td><td>Remembers light or dark theme</td><td>Preference</td><td>1 year</td></tr>
          <tr><td><code>ft_notice</code></td><td>Remembers that you closed the cookie notice</td><td>Preference</td><td>1 year</td></tr>
        </tbody>
      </table></div>

      <h2 id="changes">11. Changes</h2>
      <p>If we change this policy in a way that matters, we will update the version above and ask you to review and accept it the next time you sign in.</p>

      <h2 id="contact">12. Contact</h2>
      <p>Data Protection Officer, {LEGAL_ENTITY}, {LEGAL_ADDRESS}. Email {mail}.</p>
    </>
  );
}
