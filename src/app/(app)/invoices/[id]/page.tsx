import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { can, requireBusiness } from "@/lib/auth";
import { getInvoice, isLocked, supplierProfile, toDraft } from "@/lib/invoices";
import { fmtDate, money, todayISO } from "@/lib/format";
import { KIND_LABEL, NRS_STATUS_LABEL, PAY_LABEL, buildPayload } from "@/lib/nrs/core";
import { PROVIDERS } from "@/lib/nrs/providers";
import { mailConfigured } from "@/lib/mail";
import { NRS_CHIP, PAY_CHIP } from "@/lib/ui";
import { Flash } from "@/components/Flash";
import { ConfirmButton } from "@/components/ConfirmButton";
import { SubmitButton } from "@/components/SubmitButton";
import { InvoiceDoc } from "@/components/InvoiceDoc";
import { deleteInvoice, emailInvoice, newCreditNote, nrsAction, paymentAction } from "../actions";

export const metadata = { title: "Invoice" };

function Step({ n, state, title, children }: { n: number; state: "done" | "now" | "fail" | ""; title: string; children: React.ReactNode }) {
  return (
    <li className={`step ${state}`}>
      <span className="dot">{state === "done" ? "✓" : state === "fail" ? "!" : n}</span>
      <div className="body"><h3>{title}</h3>{children}</div>
    </li>
  );
}

export default async function InvoicePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const ctx = await requireBusiness();
  const b = ctx.business;
  const inv = await getInvoice(b.id, id);
  if (!inv) notFound();
  const editor = can(ctx.role, "accountant");
  const st = inv.nrsStatus;
  const locked = isLocked(inv);
  const reached = (s: string) => ({ validated: ["validated", "signed", "transmitted"], signed: ["signed", "transmitted"], transmitted: ["transmitted"] }[s] ?? []).includes(st);
  const provider = PROVIDERS.find((p) => p.id === b.nrsProvider)!;
  const payload = buildPayload(toDraft(inv), supplierProfile(b));
  const logs = await db.select().from(schema.nrsLogs).where(eq(schema.nrsLogs.invoiceId, inv.id)).orderBy(desc(schema.nrsLogs.createdAt)).limit(20);
  let errs: string[] = [];
  try { errs = sp.errs ? JSON.parse(sp.errs) : []; } catch { /* ignore */ }
  const shownErrors = errs.length ? errs : st === "failed" || st === "draft" ? inv.nrsErrors : [];
  const Hidden = () => <input type="hidden" name="id" value={inv.id} />;
  const Act = ({ step, label, cls = "", pending }: { step: string; label: string; cls?: string; pending?: string }) => (
    <form action={nrsAction}><Hidden /><input type="hidden" name="step" value={step} /><SubmitButton className={cls} pendingLabel={pending ?? "Working…"}>{label}</SubmitButton></form>
  );

  return (
    <div className="wrap">
      <div className="head">
        <div className="titles"><Link className="back" href="/invoices">Back to e-invoices</Link>
          <h1>{KIND_LABEL[inv.kind]} {inv.number} <span className={`chip dot ${NRS_CHIP[st]}`}>{NRS_STATUS_LABEL[st]}</span></h1></div>
        <div className="row no-print">
          <a className="btn" href={`/invoices/${inv.id}/pdf`}>Download PDF</a>
          {editor && !locked && <Link className="btn" href={`/invoices/${inv.id}/edit`}>Edit</Link>}
          {editor && locked && inv.kind === "invoice" && <form action={newCreditNote}><Hidden /><button type="submit">Issue credit note</button></form>}
          {editor && !locked && !inv.postedAt && <form action={deleteInvoice}><Hidden /><ConfirmButton>Delete</ConfirmButton></form>}
        </div>
      </div>
      <Flash ok={sp.ok} err={sp.err} errors={sp.err ? errs : undefined} />
      {!sp.err && shownErrors.length > 0 && st !== "validated" && (
        <div className="flash err"><b>To fix before NRS will accept this invoice</b><ul>{shownErrors.map((e, i) => <li key={i}>{e}</li>)}</ul></div>
      )}
      {st === "validated" && inv.nrsErrors.length > 0 && <div className="note warn">{inv.nrsErrors.join(" ")}</div>}

      <div className="detail">
        <InvoiceDoc b={b} inv={inv} />
        <div className="side no-print">
          <section className="panel">
            <div className="panel-h"><h2>NRS submission</h2><span className="hint">{inv.nrsProvider === "manual" ? "Recorded by hand" : provider.label}</span></div>
            <ol className="steps">
              <Step n={1} state={reached("validated") ? "done" : st === "failed" && !inv.irn ? "fail" : "now"} title="Validate">
                {reached("validated") ? <p className="small muted">IRN <b style={{ color: "var(--stamp)" }}>{inv.irn}</b></p> : <>
                  <p className="small muted">Checks the invoice against the NRS required fields, then asks NRS to accept the IRN and the invoice.</p>
                  {editor && <div className="row"><Act step="validate" label="Validate with NRS" cls="stamp" pending="Checking with NRS…" /></div>}</>}
              </Step>
              <Step n={2} state={st === "failed" && inv.irn ? "fail" : reached("signed") ? "done" : st === "validated" ? "now" : ""} title="Sign">
                {reached("signed") ? <p className="small muted">{inv.nrsSimulated ? "Signed in the sandbox" : "Signed"} {fmtDate(inv.nrsSignedAt)}. CSID <span style={{ overflowWrap: "anywhere" }}>{inv.nrsCsid}</span></p>
                  : st === "validated" ? <>
                    <p className="small muted">NRS signs the invoice and returns its cryptographic stamp (CSID) and QR code.</p>
                    {editor && <div className="row"><Act step="sign" label="Sign with NRS" cls="stamp" pending="Signing…" /><Act step="reset" label="Back to draft" cls="ghost" /></div>}
                    {editor && <details><summary className="small">Signed through your APP&apos;s dashboard instead?</summary>
                      <form action={nrsAction} className="grid" style={{ marginTop: 10 }}><Hidden /><input type="hidden" name="step" value="record" />
                        <label className="f" htmlFor="csid">CSID<input id="csid" name="csid" required /></label>
                        <label className="f" htmlFor="qr">QR code data<textarea id="qr" name="qr" rows={3} required /></label>
                        <label className="f" htmlFor="signedOn">Signed on<input id="signedOn" name="signedOn" type="date" defaultValue={todayISO()} /></label>
                        <SubmitButton className="">Record signature</SubmitButton></form></details>}
                  </> : st === "failed" ? <>
                    <p className="small" style={{ color: "var(--bad)" }}>NRS rejected this invoice. Correct it and validate again.</p>
                    {editor && <div className="row"><Link className="btn" href={`/invoices/${inv.id}/edit`}>Correct invoice</Link><Act step="validate" label="Validate again" /></div>}
                  </> : <p className="small muted">Available after validation.</p>}
              </Step>
              <Step n={3} state={reached("transmitted") ? "done" : st === "signed" ? "now" : ""} title="Transmit to the customer">
                {reached("transmitted") ? <p className="small muted">Transmitted {fmtDate(inv.nrsTransmittedAt)}.</p>
                  : st === "signed" ? <><p className="small muted">NRS delivers the signed invoice to the buyer&apos;s registered system. Email the PDF as well if they have none.</p>
                    {editor && <div className="row"><Act step="transmit" label="Transmit" cls="stamp" pending="Transmitting…" /></div>}</>
                  : <p className="small muted">Available after signing.</p>}
              </Step>
              <Step n={4} state={inv.postedAt ? "done" : locked ? "now" : ""} title="Post to your books">
                {inv.postedAt ? <p className="small muted">Posted {fmtDate(inv.postedAt)}: sales book, <Link href="/books/parties">debtors</Link> and journal.</p>
                  : locked ? <><p className="small muted">Adds the lines to the sales book, a {inv.kind === "credit" ? "credit against the customer" : "debtor for the amount due"}, and the journal entry for sales and output VAT.</p>
                    {editor && <div className="row"><Act step="post" label="Post to books" cls="primary" pending="Posting…" /></div>}</>
                  : <p className="small muted">Available once signed.</p>}
              </Step>
            </ol>
          </section>

          <section className="panel">
            <div className="panel-h"><h2>Payment</h2><span className={`chip dot ${PAY_CHIP[inv.paymentStatus]}`}>{PAY_LABEL[inv.paymentStatus]}</span></div>
            <dl className="kv" style={{ marginBottom: 12 }}><dt>Total</dt><dd>{money(inv.total)}</dd><dt>Paid</dt><dd>{money(inv.amountPaid)}</dd><dt>Balance</dt><dd>{money(inv.total - inv.amountPaid)}</dd></dl>
            {editor && inv.kind !== "credit" && (
              <form action={paymentAction} className="grid">
                <Hidden />
                <div className="grid g2">
                  <label className="f" htmlFor="status">Status<select id="status" name="status" defaultValue={inv.paymentStatus}>
                    {Object.entries(PAY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
                  <label className="f" htmlFor="paid">Total paid so far (₦)<input id="paid" name="paid" type="number" step="any" defaultValue={inv.amountPaid || ""} /><span className="hint">For part-payment only</span></label>
                </div>
                <div className="row end"><SubmitButton className="">Update payment</SubmitButton></div>
                <p className="hint">{inv.postedAt ? "Money received is added to the cash book against this debtor." : "Saved on the invoice; it moves to the cash book when you post."} {locked && b.nrsProvider !== "sandbox" ? "NRS is updated too." : ""}</p>
              </form>
            )}
          </section>

          <section className="panel">
            <div className="panel-h"><h2>Send</h2>{inv.emailedAt && <span className="hint">Last sent {fmtDate(inv.emailedAt)}</span>}</div>
            {mailConfigured() ? (
              <form action={emailInvoice} className="row" style={{ alignItems: "flex-end" }}><Hidden />
                <label className="f" htmlFor="to" style={{ flex: "1 1 200px" }}>Customer email<input id="to" name="to" type="email" defaultValue={inv.customer.email} required /></label>
                <SubmitButton className="" pendingLabel="Sending…">Email PDF</SubmitButton>
              </form>
            ) : <p className="small muted">Email sending is not set up on this server. Download the PDF and send it yourself, or ask whoever runs the app to add SMTP settings.</p>}
          </section>
        </div>
      </div>

      <details className="panel no-print">
        <summary>NRS payload and call log</summary>
        <div className="grid" style={{ marginTop: 14 }}>
          <p className="small muted">The JSON sent to NRS for validation and signing. Field names follow the NRS e-invoice specification.</p>
          <pre className="code">{JSON.stringify(payload, null, 2)}</pre>
          <div className="tbl"><table>
            <thead><tr><th>When</th><th>Action</th><th>Provider</th><th>Result</th><th className="r">Time</th></tr></thead>
            <tbody>{logs.map((l) => (
              <tr key={l.id}><td className="d">{l.createdAt.toISOString().replace("T", " ").slice(0, 19)}</td><td>{l.action.replace(/_/g, " ")}</td><td>{l.provider}</td>
                <td><span className={`chip dot ${l.ok ? "ok" : "bad"}`}>{l.ok ? "OK" : `Failed${l.httpStatus ? ` ${l.httpStatus}` : ""}`}</span></td><td className="r">{l.durationMs ?? ""} ms</td></tr>))}
              {!logs.length && <tr><td colSpan={5} className="muted">No calls to NRS yet.</td></tr>}</tbody>
          </table></div>
        </div>
      </details>
    </div>
  );
}
