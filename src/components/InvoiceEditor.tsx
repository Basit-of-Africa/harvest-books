"use client";
import { Fragment, useMemo, useRef, useState } from "react";
import type { InvoiceLine, PartySnapshot } from "@/db/schema";
import { KIND_LABEL, PAYMENT_MEANS, TAX_CATEGORIES, UNITS, calcInvoice, irnFor, type InvoiceDraft } from "@/lib/nrs/core";
import { money } from "@/lib/format";
import { SubmitButton } from "./SubmitButton";

type Item = { name: string; description: string; hsCode: string; category: string; unit: string; price: number; taxCategory: string };
const blank = (): InvoiceLine => ({ name: "", description: "", hsCode: "", category: "", quantity: 1, unit: "EA", price: 0, discount: 0, taxCategory: "STANDARD_VAT" });
const CATEGORIES = ["Agricultural produce", "Agro-inputs", "Livestock and dairy", "Processed food", "Equipment", "Consulting services", "Training services"];

export function InvoiceEditor({ id, initial, vatRate, serviceId, customers, items, action }: {
  id?: string; initial: InvoiceDraft; vatRate: number; serviceId: string;
  customers: PartySnapshot[]; items: Item[]; action: (fd: FormData) => Promise<void>;
}) {
  const [inv, setInv] = useState<InvoiceDraft>(() => ({ ...initial, lines: initial.lines.length ? initial.lines : [blank()] }));
  const t = useMemo(() => calcInvoice(inv.lines, vatRate), [inv.lines, vatRate]);
  const set = <K extends keyof InvoiceDraft>(k: K, v: InvoiceDraft[K]) => setInv((p) => ({ ...p, [k]: v }));
  const setC = (k: keyof PartySnapshot, v: string) => {
    if (k === "name") {
      const known = customers.find((c) => c.name === v);
      if (known) { setInv((p) => ({ ...p, customer: { ...known } })); return; }
    }
    setInv((p) => ({ ...p, customer: { ...p.customer, [k]: v } }));
  };
  const setL = (i: number, k: keyof InvoiceLine, v: string) => setInv((p) => {
    const lines = p.lines.map((l, j) => {
      if (j !== i) return l;
      if (k === "name") {
        const it = items.find((x) => x.name === v);
        if (it) return { ...l, name: v, description: it.description, hsCode: it.hsCode, category: it.category, unit: it.unit, price: it.price, taxCategory: it.taxCategory };
      }
      return { ...l, [k]: ["quantity", "price", "discount"].includes(k) ? (v === "" ? 0 : Number(v)) : v };
    });
    return { ...p, lines };
  });
  const credit = inv.kind !== "invoice";
  const intent = useRef<HTMLInputElement>(null);

  return (
    <form action={action} className="wrap" style={{ gap: 22 }}>
      {id && <input type="hidden" name="id" value={id} />}
      <input type="hidden" name="payload" value={JSON.stringify(inv)} />
      <input type="hidden" name="intent" ref={intent} defaultValue="save" />
      <section className="panel">
        <div className="panel-h"><h2>Document</h2><span className="hint">IRN preview <b style={{ color: "var(--stamp)" }}>{irnFor(inv.number, serviceId || "SERVICEID", inv.issueDate)}</b></span></div>
        <div className="grid g4">
          <label className="f" htmlFor="number">{KIND_LABEL[inv.kind]} number<input id="number" value={inv.number} onChange={(e) => set("number", e.target.value.replace(/[^A-Za-z0-9]/g, ""))} required /><span className="hint">Letters and numbers only</span></label>
          <label className="f" htmlFor="tt">Transaction type<select id="tt" value={inv.transactionType} onChange={(e) => set("transactionType", e.target.value)}>
            <option value="B2B">Business to business (B2B)</option><option value="B2G">Business to government (B2G)</option><option value="B2C">Business to consumer (B2C)</option></select></label>
          <label className="f" htmlFor="issue">Issue date<input id="issue" type="date" value={inv.issueDate} onChange={(e) => set("issueDate", e.target.value)} required /></label>
          <label className="f" htmlFor="time">Issue time<input id="time" value={inv.issueTime} onChange={(e) => set("issueTime", e.target.value)} placeholder="HH:MM:SS" /></label>
          <label className="f" htmlFor="due">Due date<input id="due" type="date" value={inv.dueDate ?? ""} onChange={(e) => set("dueDate", e.target.value || null)} /></label>
          <label className="f" htmlFor="means">Payment means<select id="means" value={inv.paymentMeans} onChange={(e) => set("paymentMeans", e.target.value)}>
            {PAYMENT_MEANS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
          {credit && <>
            <label className="f" htmlFor="refirn">Original invoice IRN<input id="refirn" value={inv.refIrn} onChange={(e) => set("refIrn", e.target.value)} /></label>
            <label className="f" htmlFor="refdate">Original issue date<input id="refdate" type="date" value={inv.refDate ?? ""} onChange={(e) => set("refDate", e.target.value || null)} /></label>
          </>}
        </div>
      </section>

      <section className="panel">
        <div className="panel-h"><h2>Customer</h2><span className="hint">Type a past customer&apos;s name to fill these fields</span></div>
        <datalist id="custlist">{customers.map((c) => <option key={c.name} value={c.name} />)}</datalist>
        <div className="grid g4">
          <label className="f span2" htmlFor="c-name">Customer name<input id="c-name" list="custlist" value={inv.customer.name} onChange={(e) => setC("name", e.target.value)} autoComplete="off" /></label>
          <label className="f" htmlFor="c-tin">Customer TIN<input id="c-tin" value={inv.customer.tin} onChange={(e) => setC("tin", e.target.value)} /></label>
          <label className="f" htmlFor="c-email">Email<input id="c-email" type="email" value={inv.customer.email} onChange={(e) => setC("email", e.target.value)} /></label>
          <label className="f" htmlFor="c-phone">Phone<input id="c-phone" type="tel" value={inv.customer.phone} onChange={(e) => setC("phone", e.target.value)} placeholder="+234" /></label>
          <label className="f" htmlFor="c-street">Street address<input id="c-street" value={inv.customer.street} onChange={(e) => setC("street", e.target.value)} /></label>
          <label className="f" htmlFor="c-city">City<input id="c-city" value={inv.customer.city} onChange={(e) => setC("city", e.target.value)} /></label>
          <label className="f" htmlFor="c-country">Country code<input id="c-country" maxLength={2} value={inv.customer.country} onChange={(e) => setC("country", e.target.value.toUpperCase())} /></label>
        </div>
      </section>

      <section className="panel">
        <div className="panel-h"><h2>Items</h2><span className="hint">NRS needs an HS code and product category on every line. Much unprocessed farm produce is zero-rated; confirm with your tax adviser.</span></div>
        <datalist id="itemlist">{items.map((i) => <option key={i.name} value={i.name} />)}</datalist>
        <datalist id="catlist">{CATEGORIES.map((c) => <option key={c} value={c} />)}</datalist>
        <div className="lines">
          {inv.lines.map((l, i) => {
            const c = t.lines[i];
            return (
              <div className="line" key={i}>
                <label className="f wide">Item<input list="itemlist" value={l.name} onChange={(e) => setL(i, "name", e.target.value)} aria-label={`Line ${i + 1} item`} /></label>
                <label className="f">HS code<input value={l.hsCode} onChange={(e) => setL(i, "hsCode", e.target.value)} placeholder="1005.90" /></label>
                <label className="f">Category<input list="catlist" value={l.category} onChange={(e) => setL(i, "category", e.target.value)} /></label>
                <label className="f">Qty<input type="number" step="any" inputMode="decimal" value={l.quantity || ""} onChange={(e) => setL(i, "quantity", e.target.value)} /></label>
                <label className="f">Unit<select value={l.unit} onChange={(e) => setL(i, "unit", e.target.value)}>{UNITS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
                <label className="f">Unit price (₦)<input type="number" step="any" inputMode="decimal" value={l.price || ""} onChange={(e) => setL(i, "price", e.target.value)} /></label>
                <label className="f">Discount (₦)<input type="number" step="any" inputMode="decimal" value={l.discount || ""} onChange={(e) => setL(i, "discount", e.target.value)} /></label>
                <label className="f">Tax<select value={l.taxCategory} onChange={(e) => setL(i, "taxCategory", e.target.value)}>
                  {Object.entries(TAX_CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}{k === "STANDARD_VAT" ? ` ${vatRate}%` : ""}</option>)}</select></label>
                <button type="button" className="ghost rm" aria-label={`Remove line ${i + 1}`} title="Remove line"
                  onClick={() => setInv((p) => ({ ...p, lines: p.lines.length > 1 ? p.lines.filter((_, j) => j !== i) : [blank()] }))}>✕</button>
                <div className="ext">Line amount {money(c?.ext)}{c?.tax ? `, VAT ${money(c.tax)}` : ""}</div>
              </div>
            );
          })}
        </div>
        <div className="row between" style={{ marginTop: 12, alignItems: "flex-start" }}>
          <button type="button" onClick={() => setInv((p) => ({ ...p, lines: [...p.lines, blank()] }))}>Add line</button>
          <dl className="kv totals">
            <dt>Subtotal</dt><dd>{money(t.subtotal)}</dd>
            {t.subtotals.map((g) => <Fragment key={g.id}><dt>{TAX_CATEGORIES[g.id]} {g.pct}% on {money(g.taxable)}</dt><dd>{money(g.tax)}</dd></Fragment>)}
            <div className="sep" /><dt className="strong">Total payable</dt><dd>{money(t.total)}</dd>
          </dl>
        </div>
      </section>

      <section className="panel">
        <label className="f" htmlFor="note">Note to customer<textarea id="note" rows={2} value={inv.note} onChange={(e) => set("note", e.target.value)} /></label>
      </section>
      <div className="row end">
        <span onClickCapture={() => { if (intent.current) intent.current.value = "save"; }}><SubmitButton className="" pendingLabel="Saving…">Save draft</SubmitButton></span>
        <span onClickCapture={() => { if (intent.current) intent.current.value = "validate"; }}><SubmitButton className="stamp" pendingLabel="Checking with NRS…">Save and validate with NRS</SubmitButton></span>
      </div>
    </form>
  );
}
