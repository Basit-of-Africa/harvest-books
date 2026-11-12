import Link from "next/link";
import { APP_NAME, LEGAL_ADDRESS, LEGAL_ENTITY, POLICY_VERSION, PRIVACY_EMAIL, SUPPORT_EMAIL } from "@/lib/brand";

export const metadata = { title: "Terms of Service", description: "The terms for using FarmTrace, including the data processing terms." };

export default function Terms() {
  return (
    <>
      <h1>Terms of Service</h1>
      <p className="meta">Version {POLICY_VERSION}. Between you (and the business you act for) and {LEGAL_ENTITY}, {LEGAL_ADDRESS}.</p>

      <h2>1. The service</h2>
      <p>{APP_NAME} lets you keep a farm or agribusiness&apos;s books (cash book, sales, purchases, petty cash, inventory, payroll, assets, debtors and creditors) with a double-entry journal, and issue invoices through the Nigeria Revenue Service (NRS) e-invoicing system directly or through an Access Point Provider.</p>

      <h2>2. Your account</h2>
      <ul>
        <li>You must be 18 or older and able to act for the business you register.</li>
        <li>Keep your password private and use one you don&apos;t use elsewhere. Tell us at {SUPPORT_EMAIL} straight away if you think someone else has used your account.</li>
        <li>Owners decide who joins their business and with which role, and are responsible for removing people who should no longer have access.</li>
      </ul>

      <h2>3. Acceptable use</h2>
      <p>Don&apos;t use {APP_NAME} to break the law, issue false or misleading invoices, evade tax, upload malware, probe or overload the service, get around its security or access controls, or access another business&apos;s data. We may suspend accounts that do, and report serious misuse to the authorities.</p>

      <h2>4. Your data</h2>
      <p>Your business owns its books and invoices. You give us permission to store and process them only to run the service for you. You can export them at any time as CSV, PDF or JSON, and delete them from the <Link href="/account">Privacy and security</Link> page. How we handle personal data is set out in the <Link href="/privacy">Privacy Policy</Link>.</p>

      <h2>5. Tax and accounting</h2>
      <p>{APP_NAME} is a tool, not tax or accounting advice. You are responsible for the accuracy of the entries and invoices you make, for VAT treatment, for keeping records for as long as Nigerian law requires (at least six years for accounting records), and for confirming with NRS or your adviser whether and when e-invoicing applies to you. Invoices signed in the built-in sandbox are marked as simulated and are <b>not valid for tax</b>.</p>

      <h2 id="dpa">6. Data processing terms</h2>
      <p>Where we process personal data in your business records on your behalf, the business is the controller and we are its processor. These terms apply in addition to any separate data processing agreement and meet the processor requirements of the Nigeria Data Protection Act 2023 and GDPR article 28. We will:</p>
      <ol>
        <li>Process the data only on your documented instructions, which are these terms and how you use the service, unless the law requires otherwise (in which case we will tell you first if we can).</li>
        <li>Make sure everyone with access is bound by confidentiality.</li>
        <li>Keep appropriate technical and organisational security measures in place, as described in the Privacy Policy.</li>
        <li>Use only the sub-processors listed in the Privacy Policy, under written terms that protect the data at least as well as these, and give notice before adding or replacing one so you can object.</li>
        <li>Transfer data outside Nigeria only with the safeguards the NDPA requires.</li>
        <li>Help you respond to requests from data subjects and with security, breach notification and data protection impact assessments, taking into account the information available to us.</li>
        <li>Tell you without undue delay, and in any case within 48 hours, after becoming aware of a personal data breach affecting your data, so you can meet your 72-hour duty to notify the NDPC.</li>
        <li>At the end of the service, or when you delete the business, delete the data (backups are overwritten within 30 days) unless the law requires us to keep it. Use the export tools first to keep a copy.</li>
        <li>Make available the information needed to show we meet these obligations, and allow for reasonable audits.</li>
      </ol>
      <p>You confirm that you have a lawful basis for the personal data you enter, for example to keep payroll and customer records, and that you have told your staff and customers about it as the law requires.</p>

      <h2>7. Availability and changes</h2>
      <p>We work to keep {APP_NAME} available and secure but can&apos;t promise it will never be interrupted. We may change features. If we change these terms in a way that matters, we will ask you to accept the new version when you next sign in.</p>

      <h2>8. Liability</h2>
      <p>To the extent the law allows, we are not liable for indirect or consequential losses, lost profits, or penalties that come from wrong entries or invoices you made. Nothing in these terms limits liability that can&apos;t be limited by law, including your rights under consumer and data protection law.</p>

      <h2>9. Ending the service</h2>
      <p>You can close your account at any time from the Privacy and security page. We may suspend or close accounts that break these terms, and will give notice and a chance to export data unless the law or a security risk prevents it.</p>

      <h2>10. Law and disputes</h2>
      <p>These terms are governed by the laws of the Federal Republic of Nigeria. We will first try to settle any dispute informally; if that fails, the courts of Nigeria have jurisdiction. If you are a consumer elsewhere, you keep the protections of the law where you live.</p>

      <h2>11. Contact</h2>
      <p>Support: <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>. Privacy and data protection: <a href={`mailto:${PRIVACY_EMAIL}`}>{PRIVACY_EMAIL}</a>.</p>
    </>
  );
}
