import QRCode from "qrcode";
import { Fragment } from "react";
import { schema } from "@/db";
import { fmtDate, money, qty } from "@/lib/format";
import { KIND_LABEL, PAYMENT_MEANS, TAX_CATEGORIES, calcInvoice, irnFor } from "@/lib/nrs/core";

type Business = typeof schema.businesses.$inferSelect;
type Invoice = typeof schema.invoices.$inferSelect;

/** The paper invoice, with the NRS seal: QR code, IRN and CSID once signed. */
export async function InvoiceDoc({ b, inv }: { b: Business; inv: Invoice }) {
  const t = calcInvoice(inv.lines, b.vatRate);
  const signed = inv.nrsStatus === "signed" || inv.nrsStatus === "transmitted";
  const qr = signed && inv.nrsQr ? await QRCode.toDataURL(inv.nrsQr, { errorCorrectionLevel: "M", margin: 0, width: 224 }) : "";
  const c = inv.customer;
  const means = PAYMENT_MEANS.find((m) => m[0] === inv.paymentMeans)?.[1];
  return (
    <article className="doc" style={{ ["--brand" as any]: b.brandColor }} aria-label="Invoice preview">
      <div className="band" />
      <div className="doc-top">
        <div className="doc-from">
          {b.logo && /^data:image\/(png|jpeg|svg\+xml);base64,/.test(b.logo) && <img src={b.logo} alt="" />}
          <div><b>{b.name}</b>
            <div className="dm">{[b.street, b.city, b.state].filter(Boolean).join(", ")}</div>
            <div className="dm">TIN {b.tin || "not set"}</div>
            <div className="dm">{[b.email, b.phone].filter(Boolean).join("  ")}</div></div>
        </div>
        <div className="doc-title"><div className="t">{KIND_LABEL[inv.kind]}</div><div className="n">{inv.number}</div></div>
      </div>
      <div className="doc-parties">
        <div><h5>Bill to</h5><b>{c.name}</b><div className="dm">{[c.street, c.city].filter(Boolean).join(", ")}</div>{c.tin && <div className="dm">TIN {c.tin}</div>}<div className="dm">{c.email}</div></div>
        <div><h5>Dates</h5><div>Issued {fmtDate(inv.issueDate)}</div>{inv.dueDate && <div>Due {fmtDate(inv.dueDate)}</div>}{inv.refIrn && <div className="dm">Ref {inv.refIrn}</div>}</div>
        <div><h5>Payment</h5><div>{means}</div>{b.bankDetails && <div className="dm" style={{ whiteSpace: "pre-line" }}>{b.bankDetails}</div>}</div>
      </div>
      <div className="tbl"><table>
        <thead><tr><th>Item</th><th>HS code</th><th className="r">Qty</th><th className="r">Unit price</th><th className="r">VAT</th><th className="r">Amount</th></tr></thead>
        <tbody>{t.lines.map((l, i) => (
          <tr key={i}><td>{l.name}{l.discount ? <div className="dm small">Less discount {money(l.discount)}</div> : null}</td><td>{l.hsCode}</td>
            <td className="r">{qty(l.quantity)} {l.unit}</td><td className="r">{money(l.price)}</td><td className="r">{l.pct}%</td><td className="r">{money(l.ext)}</td></tr>))}</tbody>
      </table></div>
      <div className="doc-foot">
        <div className={`seal${signed ? "" : " pending"}`}>
          {signed && inv.nrsSimulated && <span className="sim">Sandbox, not valid for tax</span>}
          <div className={`qr${qr ? "" : " empty"}`}>{qr ? <img src={qr} alt="NRS QR code" /> : inv.nrsStatus === "validated" ? "QR code appears once NRS signs" : "Not yet submitted to NRS"}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
            <span className="lbl">{signed ? "NRS e-invoice" : "Awaiting NRS signature"}</span>
            <span className="irn">{inv.irn || irnFor(inv.number, b.nrsServiceId || "SERVICEID", inv.issueDate)}</span>
            <span className="meta">{signed ? <>CSID {inv.nrsCsid}<br />Signed {fmtDate(inv.nrsSignedAt)}</> : "Invoice Reference Number, confirmed when NRS validates"}</span>
          </div>
        </div>
        <dl className="kv doc-sum">
          <dt>Subtotal</dt><dd>{money(t.subtotal)}</dd>
          {t.subtotals.map((g) => <Fragment key={g.id}><dt>{TAX_CATEGORIES[g.id]} {g.pct}%</dt><dd>{money(g.tax)}</dd></Fragment>)}
          <dt className="grand">Total</dt><dd className="grand">{money(t.total)}</dd>
          {inv.amountPaid > 0 && <><dt>Paid</dt><dd>{money(inv.amountPaid)}</dd><dt>Balance due</dt><dd>{money(t.total - inv.amountPaid)}</dd></>}
        </dl>
      </div>
      {(inv.note || b.terms) && <p className="dm small">{inv.note} {b.terms}</p>}
    </article>
  );
}
