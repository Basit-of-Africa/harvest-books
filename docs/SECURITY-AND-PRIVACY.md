# FarmTrace security and data protection

This document lists the security and privacy controls built into FarmTrace and how they map to the **Nigeria Data Protection Act 2023 (NDPA)**, the NDPC's **General Application and Implementation Directive (GAID)** and the **EU/UK GDPR**. It ends with the steps the operator of a deployment still has to take. Software alone can't make an organisation compliant.

> This is an engineering summary, not legal advice. Have the Privacy Policy, Terms and your registration status reviewed by a data protection lawyer or a licensed Data Protection Compliance Organisation (DPCO) before launch.

## Roles

| Data | FarmTrace's role | Who decides |
|---|---|---|
| Accounts: name, email, password hash, sessions, audit log, consent record | **Controller** | The FarmTrace operator |
| Business records: customers, suppliers, staff and payroll, invoices, books | **Processor** | Each business (the controller) |

The processor terms are in `/terms#dpa`. They cover acting only on instructions, confidentiality, security, sub-processors, cross-border transfers, helping with data subject requests, breach notice within 48 hours, deletion at the end of the service, and audits.

## Controls in the code

### Authentication and sessions (`src/lib/auth.ts`, `src/app/(auth)/actions.ts`)
- Passwords are hashed with bcrypt (cost 12). The policy is at least 12 characters and at most 72 bytes, rejects common passwords, and rejects passwords built from the email or name (NIST SP 800-63B).
- Rate limits are stored in the database, so they hold across serverless instances: 5 failed sign-ins per email in 15 minutes locks that email, 30 attempts per network in 15 minutes are allowed, and 10 sign-ups per network per hour. The email limit applies whether or not the account exists. Unknown emails are checked against a dummy bcrypt hash, so response timing doesn't reveal which accounts exist.
- The session cookie is `__Host-ft_session`, with HttpOnly, Secure, SameSite=Lax and Path=/. It holds a random 256-bit token, and only its SHA-256 is stored.
- Sessions end after 12 hours idle and 14 days in any case. A fresh token is issued at every sign-in.
- A password change signs out every other device. People can see their devices and sign them out remotely on `/account`.
- Server actions get Next.js's built-in Origin check against CSRF. `serverActions.allowedOrigins` is pinned to `APP_URL`.

### Authorisation
- Every page, route and action calls `requireBusiness(role)`. Every query is scoped by `business_id`, and record ids from the browser are always checked against the active business.
- Owners alone change setup, NRS credentials, the team, and business deletion.

### Browser hardening (`src/middleware.ts`, `next.config.ts`)
- The Content Security Policy uses a per-request nonce with `'strict-dynamic'`, `object-src 'none'`, `frame-ancestors 'none'`, `base-uri 'self'` and `form-action 'self'`. Only scripts Next.js renders can run.
- Other headers: HSTS (2 years, preload), X-Content-Type-Options, X-Frame-Options DENY, Referrer-Policy, a Permissions-Policy that disables camera, microphone, geolocation, payment and FLoC/Topics, COOP and CORP.
- Signed-in pages send `Cache-Control: private, no-store`. The `X-Powered-By` header is removed.
- Fonts are self-hosted, so no Google Fonts call sends visitors' IP addresses to a third party.

### Data handling
- NRS API keys are encrypted with AES-256-GCM using `ENCRYPTION_KEY`, are never sent to the browser, and are redacted from the NRS call log.
- SSRF guard (`src/lib/net.ts`): NRS and APP URLs must use https and resolve only to public addresses. This is checked when settings are saved and again before each call, and redirects are refused.
- CSV exports prefix cells starting with `= + - @` (formula injection).
- Logo uploads are checked by their file signature (PNG or JPEG), not by the type the browser declares, and are capped at 150 KB.
- Database errors are replaced with plain messages before they reach the screen (`publicMessage`), so SQL and table names don't leak.
- IP addresses are stored only as keyed HMAC hashes (data minimisation).

### Accountability
- The audit log (`audit_logs`) records sign-ins, failures and lockouts, sign-outs, password changes, consent, team changes, NRS credential changes, invoice signing, transmission, deletion and emails, exports, and account and business deletions. Owners see the business log on `/account`.

## Data subject rights (NDPA 2023; GDPR arts. 12–22)

| Right | How it works in FarmTrace |
|---|---|
| Be informed | `/privacy`, linked from sign-up, sign-in, the footer and the cookie notice |
| Access and portability | `/account/export` gives the person's data as JSON. `/account/export-business` gives the owner a full archive of the books. Each book also exports to CSV |
| Rectification | Edit your name on `/account`. Business records are edited in the books |
| Erasure | Close your account on `/account`, or delete a business. Only-member businesses are erased with all their records, and audit entries are unlinked from the person |
| Withdraw consent | Close the account. An updated policy version must be re-accepted at `/consent` |
| Object or restrict | By email to `PRIVACY_EMAIL`. The policy promises a reply within 30 days |
| Complain | NDPC, EU supervisory authorities and the UK ICO, all named in the policy |

## Consent and cookies
- At sign-up and on invitation, people confirm they are 18 or older and accept the Terms and Privacy Policy. The accepted `POLICY_VERSION` and time are stored on the user.
- To make people accept an updated policy, bump `POLICY_VERSION` in `src/lib/brand.ts`. Everyone is then sent to `/consent` on their next visit.
- Cookies are strictly necessary (session) or preferences (theme, notice dismissed). There are no analytics, advertising or third-party cookies, so no consent banner is needed. An information-only notice is shown.

## Retention (`src/lib/privacy.ts`)

| Data | Period |
|---|---|
| Sessions | 12 h idle, 14 days absolute |
| Sign-in attempts | 24 h |
| Used or expired invitations | 30 days |
| Audit log | `AUDIT_RETENTION_DAYS` (default 730) |
| Accounts | Until closed |
| Business records | Until the owner deletes them (Nigerian tax law: keep at least 6 years) |

The clean-up runs daily through Vercel Cron (`vercel.json`, which calls `/api/cron/purge` with `CRON_SECRET`), or by hand with `npm run db:purge`.

## Operator checklist (things the code can't do for you)

1. **NDPC registration.** Work out whether you are a data controller or processor of major importance under the NDPA and GAID, and if so register with the Nigeria Data Protection Commission and pay the fee. Put the number in `NDPC_REGISTRATION`.
2. **Data Protection Officer.** Appoint a DPO. Point `PRIVACY_EMAIL` at a monitored inbox.
3. **Compliance audit returns.** Where they apply to you, file annual audit returns with the NDPC through a licensed DPCO.
4. **Data processing agreements.** Sign the DPAs with Vercel and Neon, and with your SMTP provider. Keep the list of sub-processors in `/privacy` up to date.
5. **Cross-border transfers.** Choose the Neon region on purpose and set `DATA_REGION`. Document the transfer basis: adequacy, or standard contractual clauses or another safeguard the NDPA accepts. For EU users, use the EU SCCs, plus the UK Addendum for UK users.
6. **DPIA.** Run a data protection impact assessment. Payroll and customer data processed at scale may need one.
7. **Breach response.** Write a short plan: who decides, how to contain a breach, notifying the NDPC within 72 hours, notifying affected businesses and people, and keeping a record. The Terms promise businesses notice within 48 hours.
8. **Legal review.** Fill in `LEGAL_ENTITY` and `LEGAL_ADDRESS`, and have counsel review `/privacy` and `/terms`.
9. **Secrets.** Generate `ENCRYPTION_KEY` and `CRON_SECRET` with a CSPRNG, store them only in Vercel's environment settings, and rotate them if they are exposed. Rotating `ENCRYPTION_KEY` means businesses re-enter their NRS credentials.
10. **Platform settings.** Turn on Vercel deployment protection for preview builds, and require two-factor authentication on GitHub, Vercel and Neon. Use Neon's pooled connection over TLS (already enforced: `rejectUnauthorized: true`).
11. **Staff training.** Anyone with production database access should be trained and bound by confidentiality. Keep that access to a minimum.

## Ideas for later
- Two-factor authentication (TOTP or passkeys) for owners.
- Email verification at sign-up, and self-service password reset by email.
- Field-level encryption for bank details and staff pay.
- Alerting on lockouts and unusual exports.
