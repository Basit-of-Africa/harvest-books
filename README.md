# Harvest Books

Bookkeeping and NRS e-invoicing for Nigerian agribusinesses. Built on the *Simple Bookkeeping Pack* workbook (`docs/Bookkeeping_Pack.xlsx`): its nine books and monthly summary, with a double-entry journal underneath and an e-invoicing module that validates, signs and transmits invoices through the Nigeria Revenue Service (NRS).

**Stack:** Next.js 15 (App Router, server actions) · TypeScript · PostgreSQL on Neon · Drizzle ORM · deployed on Vercel.

## What it does

| Area | What you get |
|---|---|
| **Books** | Cash book, sales, purchases, petty cash, inventory, payroll, asset register, debtors and creditors. The workbook's formulas are kept: running balances, quantity × price, per-item stock, straight-line depreciation. Every book exports to CSV. |
| **Double entry** | Every entry posts a balanced journal entry to a chart of accounts. A cash sale also writes its cash book line; a credit sale or purchase creates the debtor or creditor; payments recorded against them go to the cash book. The trial balance shows whether debits and credits match. |
| **Monthly summary** | The workbook's SUMIFS totals for any period, plus cash at bank, profit, net VAT, overdue debtors and an e-invoicing readiness checklist. |
| **NRS e-invoicing** | B2B, B2G and B2C invoices, credit notes and debit notes. Required-field checks, IRN generation, the NRS JSON payload, validation and signing through a pluggable provider, transmission, payment-status updates, a call log, and posting into the books. |
| **Invoice PDF and email** | Branded A4 PDF with the NRS seal (QR code, IRN, CSID), emailed to the customer over SMTP. |
| **Logins and roles** | Email and password accounts. Several businesses per person. Owner, accountant and viewer roles. Invitations by link or email. |

## Website

The home page (`/`) is the public website: product tour, e-invoicing, who it's for, FAQ and sign-up. It is light-only and lives in `src/app/page.tsx` with its styles in `src/app/landing.css`. Its screenshots in `public/marketing/` are captures of the real app running on the demo data. Retake them after interface changes so the site stays accurate.

## Run it locally

Needs Node 20+ and a Postgres database (a free Neon project works, or local Postgres).

```bash
npm install
cp .env.example .env.local      # then fill in DATABASE_URL and ENCRYPTION_KEY
npm run db:migrate              # creates the tables
npm run db:seed                 # optional: demo business with the workbook's example rows
npm run dev                     # http://localhost:3000
```

The seed signs you in as `demo@harvestbooks.ng` with password `harvest-demo-2026`. You can change both with `SEED_EMAIL` and `SEED_PASSWORD`. Example rows are marked "Example".

```bash
npm test          # unit tests; add DATABASE_URL to also run the posting test against a disposable database
npm run typecheck
```

## Deploy on Neon and Vercel

1. **Neon:** create a project and copy the **pooled** connection string.
2. **Migrate:** from your machine, run `DATABASE_URL="<neon url>" npm run db:migrate`. Run it again whenever a new migration is added under `drizzle/`.
3. **Vercel:** import the GitHub repo and add these environment variables:
   - `DATABASE_URL`: the Neon pooled string.
   - `ENCRYPTION_KEY`: from `openssl rand -base64 32`. Keep a copy. Changing it makes saved NRS credentials unreadable.
   - `APP_URL`: the deployed address, used in invitation links.
   - `SMTP_*` and `MAIL_FROM`: optional, for emailing invoices and invitations.
4. Deploy, open the site and create your account. The first account becomes the owner of the business it creates.

## Connecting to NRS

Each business picks its connection under **Business and NRS setup → NRS connection**. Credentials are encrypted (AES-256-GCM) with `ENCRYPTION_KEY` and are never sent back to the browser.

| Provider | Use it for |
|---|---|
| **Built-in sandbox** (default) | Trying the whole flow. Signatures are simulated, and invoices and PDFs are clearly marked as not valid for tax. |
| **NRS Merchant Buyer Solution (direct)** | Taxpayers with their own NRS e-invoicing access. Uses the `x-api-key` and `x-api-secret` headers. When signing doesn't return a QR code, the app builds one from the NRS public key and certificate in your crypto keys file. |
| **Access Point Provider (generic)** | APPs that accept the standard NRS payload on their own URL. |

If NRS or your APP is used outside the app, the invoice page can also record a CSID and QR code by hand.

**Before going live, check these against your NRS or APP documentation:**

- **Endpoint paths.** The defaults are `/api/v1/invoice/irn/validate`, `/invoice/validate`, `/invoice/sign`, `/invoice/transmit/{irn}` and `/invoice/update/{irn}` for payment status. Any of them can be overridden per business in setup, with no code change.
- **Invoice type codes.** Published guides disagree. The defaults follow UBL (380 invoice, 381 credit note, 384 debit note) and can be changed per business.
- **Response fields.** The sign step reads the CSID and QR code from the common field names (`csid`, `qr_code`, `QRCodeData`). If your provider returns other names, adjust `signInvoice` in `src/lib/nrs/providers.ts`.

**APPs with their own API shape** (Interswitch, DigiTax and others) plug in by implementing the `NrsProvider` interface in `src/lib/nrs/providers.ts` and adding them to `PROVIDERS`. Nothing else in the app needs to change.

### The flow

1. **Validate:** the app checks the required fields, then calls NRS to validate the IRN and the invoice. The IRN is `InvoiceNumber-ServiceID-YYYYMMDD`.
2. **Sign:** NRS returns the CSID, and the QR code is stored on the invoice and printed in the seal.
3. **Transmit:** NRS delivers the invoice to the buyer's registered system.
4. **Post:** sales book lines, a debtor for the amount due, and the journal entry (receivables, sales, output VAT).
5. **Payments:** money received is added to the cash book against the debtor, and the payment status is sent to NRS.

Signed invoices are locked. Corrections go through a credit note that references the original IRN.

## How the books post

| Entry | Debit | Credit |
|---|---|---|
| Cash sale | Cash | Sales, Output VAT |
| Credit sale or posted e-invoice | Receivables | Sales, Output VAT |
| Purchase paid / on credit | Purchases, Input VAT | Cash / Payables |
| Payroll | Wages | Cash |
| Petty cash top-up / spending | Petty cash / Expense | Cash / Petty cash |
| Asset bought / already owned | Equipment | Cash / Owner's capital |
| Depreciation (posted from the asset register) | Depreciation | Accumulated depreciation |
| Money received from a debtor | Cash | Receivables |
| Opening cash, petty float, balances brought forward | Cash, Petty cash, Receivables | Owner's capital |

Posting is idempotent: editing an entry rewrites its journal entry and anything it generated. The rules live in `src/lib/posting.ts`.

## Project layout

```
src/app/(auth)        sign in, sign up, invitations, onboarding
src/app/(app)         dashboard, books/[book], invoices, accounts, settings, team
src/lib/posting.ts    double-entry rules
src/lib/books.ts      book definitions and workbook formulas
src/lib/nrs/core.ts   totals, IRN, validation, NRS payload (shared by browser and server)
src/lib/nrs/providers.ts  NRS connection adapters, credential encryption, QR builder
src/lib/invoices.ts   invoice lifecycle: validate, sign, transmit, post, payments
src/lib/pdf.ts        invoice PDF
src/db/schema.ts      database schema; migrations in drizzle/
data/sample-books.json  example rows from the workbook
```

## Limits

- Amounts are in naira only.
- One PDF page holds about 20 invoice lines.
- Many unprocessed agricultural products are zero-rated or exempt from VAT. Set the tax category for each line, and confirm each product's treatment with a tax adviser.
- Depreciation is computed live in the asset register and posted to the journal only when you choose to post it.

## References

- NRS e-invoicing documentation: <https://einvoice.nrs.gov.ng/docs/introduction?version=1.1>
- Interswitch NRS e-invoicing guide (field list, IRN format, code lists): <https://docs.interswitchgroup.com/docs/nrs-e-invoicing>
- DigiTax NRS e-invoice flow: <https://ng.docs.digitax.tech/docs/firs-e-invoice-flow>
