# Harvest Books

Bookkeeping and NRS e-invoicing for a growing Nigerian agribusiness. It is built on the logic of the *Simple Bookkeeping Pack* workbook (`docs/Bookkeeping_Pack.xlsx`): nine linked books plus a monthly summary. On top of that it adds an e-invoicing module that follows the Nigeria Revenue Service (NRS) e-invoice format.

It is one self-contained `index.html` with no build step and no server.

## Run it

- **Locally:** open `index.html` in a browser.
- **GitHub Pages:** Settings → Pages → Deploy from branch → `main` / root. The app is then served at `https://<owner>.github.io/harvest-books/`.
- **Examples:** Business and NRS setup → *Load example rows* loads `data/sample-books.json`, the example rows from the workbook. When the file is opened directly from disk, use *Restore from backup* and pick that file instead.

Records are saved in the browser (`localStorage`). Use **Download backup** on the setup page regularly. Clearing site data, or switching to another browser or device, starts the books empty. The same file also runs as a claude.ai artifact, where records go to a shared store instead.

## What's inside

| Book | Logic carried over from the workbook |
|---|---|
| Cash book | Running balance from an opening balance (`F5 + In − Out`) |
| Sales book | Amount = quantity × unit price, with payment status |
| Purchases book | Amount = quantity × unit cost; adds input VAT paid |
| Petty cash | Running balance from the float; adds top-ups |
| Inventory | Qty in − qty out. The balance runs per item; the workbook ran one balance across all items |
| Payroll | Amount = days or hours × rate |
| Asset register | Straight-line depreciation (`cost ÷ life`), plus depreciation to date and book value today |
| Debtors and creditors | Outstanding, part-paid or settled, flagged overdue against today |
| Monthly summary | The `SUMIFS` totals for any period, plus cash balance, gross margin, VAT and receivables |

Each book exports to CSV.

## NRS e-invoicing

1. **Setup.** Add your TIN, the NRS **Business ID** (36-character UUID) and the **Service ID** (8 characters), your contact details and address.
2. **Create.** Fill in the invoice kind (B2B / B2G / B2C), the customer, and the lines. Each line has an HS code, a product category, a unit and a tax category (`STANDARD_VAT` at 7.5%, `ZERO_VAT` or `EXEMPTED`).
3. **Validate.** Checks the required NRS fields and generates the IRN: `InvoiceNumber-ServiceID-YYYYMMDD`.
4. **Sign.** Download the NRS JSON payload (`business_id`, `irn`, `invoice_type_code`, the supplier and customer parties, `invoice_line[]`, `tax_total`, `legal_monetary_total`, and so on) and submit it through your **Access Point Provider (APP)**. Then record the CSID and QR code data it returns. The invoice shows the signed QR code and IRN in its NRS seal.
5. **Transmit, get paid, post.** Mark the invoice transmitted, and update the payment status (`PENDING` / `PARTIAL` / `PAID`). *Post to books* writes the sales lines, a debtor entry and cash received into the ledgers. A credit note references the original IRN and posts as a reversal.

### Limits

- **No live NRS connection.** This app does not call the NRS or APP APIs. Those calls need API keys and a secret, which must never sit in a browser page. Live submission belongs in a small server (or your APP's dashboard) that takes the JSON this app produces. The `payload()` function in `index.html` builds that JSON in one place, ready to send.
- **Test signing.** *Simulate signing* creates a fake CSID and QR code so you can try the flow. Those invoices are clearly marked as not valid for tax.
- **Invoice type codes vary between published guides.** The defaults follow the UBL convention: 380 invoice, 381 credit note, 384 debit note. Confirm them against the invoice-types list from your APP or the NRS resources endpoint, and change them in setup if they differ.
- **VAT treatment is per line.** Many unprocessed agricultural products are zero-rated or exempt. Confirm each product's treatment with a tax adviser.

### References

- NRS e-invoicing documentation: <https://einvoice.nrs.gov.ng/docs/introduction?version=1.1>
- Interswitch NRS e-invoicing guide (field list, IRN format, code lists): <https://docs.interswitchgroup.com/docs/nrs-e-invoicing>
- DigiTax NRS e-invoice flow: <https://ng.docs.digitax.tech/docs/firs-e-invoice-flow>

## Structure

```
index.html              the whole app (HTML, CSS, JS)
data/sample-books.json  example rows from the workbook, in backup format
docs/Bookkeeping_Pack.xlsx  the source workbook
```

The only outside dependencies are Google Fonts (Archivo, Public Sans) and `qrcode-generator` 1.4.4 from cdnjs, which draws the QR codes.
