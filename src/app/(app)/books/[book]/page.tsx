import Link from "next/link";
import { notFound } from "next/navigation";
import { can, requireBusiness } from "@/lib/auth";
import { BOOKS, isBook, type Column, type Field } from "@/lib/books";
import { loadBook } from "@/lib/book-data";
import { GENERATED_CASH } from "@/lib/posting";
import { fmtDate, money, qty, r2, todayISO } from "@/lib/format";
import { Flash } from "@/components/Flash";
import { ConfirmButton } from "@/components/ConfirmButton";
import { SubmitButton } from "@/components/SubmitButton";
import { deleteEntry, depreciateAll, recordPayment, saveEntry, saveOpening } from "../actions";

export async function generateMetadata({ params }: { params: Promise<{ book: string }> }) {
  const { book } = await params;
  return { title: isBook(book) ? BOOKS[book].title : "Book" };
}

const SOURCE_LABEL: Record<string, [string, string]> = {
  sale: ["Sales book", "/books/sales"], purchase: ["Purchases book", "/books/purchases"], payroll: ["Payroll", "/books/payroll"],
  petty: ["Petty cash", "/books/petty"], asset: ["Asset register", "/books/assets"], invoice: ["E-invoice", "/invoices"], party_payment: ["Payment", "/books/parties"],
};

export default async function BookPage({ params, searchParams }: { params: Promise<{ book: string }>; searchParams: Promise<Record<string, string>> }) {
  const { book } = await params;
  if (!isBook(book)) notFound();
  const sp = await searchParams;
  const ctx = await requireBusiness();
  const def = BOOKS[book];
  const editor = can(ctx.role, "accountant");
  const { rows, accounts } = await loadBook(book, ctx.business);
  const editing = sp.edit ? rows.find((r) => r.id === sp.edit) : undefined;
  const paying = book === "parties" && sp.pay ? rows.find((r) => r.id === sp.pay) : undefined;

  const locked = (r: Record<string, any>) =>
    (book === "cash" && r.sourceType && (GENERATED_CASH as readonly string[]).includes(r.sourceType)) || (book === "parties" && !!r.sourceType) || (book === "sales" && !!r.invoiceId);

  const input = (f: Field) => {
    const id = `f-${f.key}`;
    const v = editing ? editing[f.key] : undefined;
    const cls = `f${f.wide ? " span2" : ""}`;
    if (f.type === "checkbox") return <label key={f.key} className="check" htmlFor={id}><input id={id} name={f.key} type="checkbox" defaultChecked={!!v} />{f.label}</label>;
    if (f.type === "select") return <label key={f.key} className={cls} htmlFor={id}>{f.label}<select id={id} name={f.key} defaultValue={v ?? f.options![0]}>{f.options!.map((o) => <option key={o}>{o}</option>)}</select></label>;
    if (f.type === "account") {
      const opts = accounts.filter((a) => !f.accountTypes || f.accountTypes.includes(a.type as any)).filter((a) => !["1000"].includes(a.code));
      const def = v ?? accounts.find((a) => a.code === f.defaultAccount)?.id ?? "";
      return <label key={f.key} className={cls} htmlFor={id}>{f.label}<select id={id} name={f.key} defaultValue={def}>
        <option value="">Choose automatically</option>{opts.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}</select>{f.hint && <span className="hint">{f.hint}</span>}</label>;
    }
    const type = f.type === "date" ? "date" : f.type === "number" ? "number" : "text";
    const dv = v ?? (f.type === "date" && f.key === "date" ? todayISO() : "");
    return <label key={f.key} className={cls} htmlFor={id}>{f.label}<input id={id} name={f.key} type={type} step={f.type === "number" ? "any" : undefined} inputMode={f.type === "number" ? "decimal" : undefined} required={f.required} defaultValue={dv === 0 && !editing ? "" : (dv as any)} />{f.hint && <span className="hint">{f.hint}</span>}</label>;
  };

  const cell = (r: Record<string, any>, c: Column, first: boolean) => {
    const v = r[c.key];
    if (c.kind === "date") return <td key={c.key} className="d">{fmtDate(v)}</td>;
    if (c.kind === "money") return <td key={c.key} className={`r${Number(v) < 0 ? " neg" : ""}`}>{v === null || v === undefined || (v === 0 && ["moneyIn", "moneyOut", "topUp", "amountOut", "vat"].includes(c.key)) ? "" : money(v)}</td>;
    if (c.kind === "qty") return <td key={c.key} className="r">{v === 0 && ["qtyIn", "qtyOut"].includes(c.key) ? "" : qty(v)}</td>;
    if (c.key === "status") return <td key={c.key}><span className={`chip dot ${v === "Settled" ? "ok" : v === "Overdue" ? "bad" : v === "Credit" ? "stamp" : "warn"}`}>{v}</span></td>;
    if (c.key === "kind") return <td key={c.key}><span className={`chip ${v === "Debtor" ? "ledger" : "stamp"}`}>{v}</span></td>;
    const src = r.sourceType ? SOURCE_LABEL[r.sourceType] : r.invoiceId ? SOURCE_LABEL.invoice : null;
    return <td key={c.key}>{v}{first && r.example && <> <span className="chip">Example</span></>}{first && src && <> <Link className="chip stamp" href={r.invoiceId ? `/invoices/${r.invoiceId}` : r.sourceType === "invoice" ? `/invoices/${r.sourceId}` : src[1]}>{src[0]}</Link></>}</td>;
  };
  const textCol = def.columns.findIndex((c) => !c.kind);
  const last = rows.at(-1);

  return (
    <div className="wrap">
      <div className="head">
        <div className="titles"><h1>{def.title}</h1><p className="lede">{def.blurb}</p></div>
        <div className="row"><a className="btn" href={`/books/${book}/export`}>Export CSV</a>
          {book === "assets" && editor && <form action={depreciateAll}><SubmitButton className="" pendingLabel="Posting…">Post depreciation to today</SubmitButton></form>}</div>
      </div>
      <Flash ok={sp.ok} err={sp.err} />

      {def.opening && editor && (
        <form className="panel row" action={saveOpening} style={{ alignItems: "flex-end" }}>
          <input type="hidden" name="book" value={book} />
          <label className="f" htmlFor="opening" style={{ flex: "1 1 200px" }}>{def.opening.label}<input id="opening" name="value" type="number" step="any" defaultValue={ctx.business[def.opening.key]} /></label>
          {book === "cash" && <label className="f" htmlFor="opening-date" style={{ flex: "1 1 160px" }}>As at<input id="opening-date" name="date" type="date" defaultValue={ctx.business.cashOpeningDate ?? ""} /></label>}
          <SubmitButton className="" pendingLabel="Saving…">Save balance</SubmitButton>
        </form>
      )}

      {paying && editor && (
        <form className="panel" action={recordPayment} id="pay">
          <div className="panel-h"><h2>{paying.kind === "Debtor" ? `Record money received from ${paying.name}` : `Record payment to ${paying.name}`}</h2><Link className="btn ghost" href={`/books/${book}`}>Cancel</Link></div>
          <input type="hidden" name="partyId" value={paying.id} />
          <div className="grid g3">
            <label className="f" htmlFor="p-amt">Amount (₦)<input id="p-amt" name="amount" type="number" step="any" defaultValue={r2(paying.amount - paying.paid)} required /><span className="hint">Outstanding {money(paying.outstanding)}</span></label>
            <label className="f" htmlFor="p-date">Date<input id="p-date" name="date" type="date" defaultValue={todayISO()} required /></label>
            <label className="f" htmlFor="p-ref">Ref / receipt no<input id="p-ref" name="ref" /></label>
          </div>
          <div className="row end" style={{ marginTop: 12 }}><SubmitButton pendingLabel="Recording…">Record payment</SubmitButton></div>
        </form>
      )}

      {editor && !paying && (
        <form className="panel" action={saveEntry} id="entry" key={editing?.id ?? "new"}>
          <div className="panel-h"><h2>{editing ? `Edit ${def.singular}` : `New ${def.singular}`}</h2>{editing && <Link className="btn ghost" href={`/books/${book}`}>Cancel</Link>}</div>
          <input type="hidden" name="book" value={book} />
          {editing && <input type="hidden" name="id" value={editing.id} />}
          <div className="grid gauto">{def.fields.map(input)}</div>
          <div className="row end" style={{ marginTop: 14 }}><SubmitButton pendingLabel="Saving…">{editing ? "Save changes" : "Add entry"}</SubmitButton></div>
        </form>
      )}

      <div className="panel flush">
        {!rows.length ? (
          <div className="empty"><b>No entries yet</b><span>{editor ? `Add your first ${def.singular} with the form above.` : "Entries will appear here once your team adds them."}</span></div>
        ) : (
          <div className="tbl"><table>
            <thead><tr>{def.columns.map((c) => <th key={c.key} className={c.kind === "money" || c.kind === "qty" ? "r" : ""}>{c.label}</th>)}{editor && <th><span className="hint">Actions</span></th>}</tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={r.example ? "ex" : ""}>
                  {def.columns.map((c, i) => cell(r, c, i === textCol))}
                  {editor && <td className="act">
                    {book === "parties" && r.outstanding > 0 && <Link className="btn ghost" href={`/books/parties?pay=${r.id}#pay`}>{r.kind === "Debtor" ? "Receive" : "Pay"}</Link>}
                    {!locked(r) && !(book === "cash" && r.sourceType === "party_payment") && <Link className="btn ghost" href={`/books/${book}?edit=${r.id}#entry`}>Edit</Link>}
                    {!locked(r) && <form action={deleteEntry}><input type="hidden" name="book" value={book} /><input type="hidden" name="id" value={r.id} /><ConfirmButton>Delete</ConfirmButton></form>}
                  </td>}
                </tr>
              ))}
              {book !== "inventory" && (
                <tr className="total">
                  {def.columns.map((c, i) => {
                    if (i === 0) return <td key={c.key}>Total</td>;
                    if (c.key === "balance" && last) return <td key={c.key} className="r">{money(last.balance)}</td>;
                    if (c.total) return <td key={c.key} className="r">{money(rows.reduce((s, r) => s + Number(r[c.key] ?? 0), 0))}</td>;
                    return <td key={c.key} />;
                  })}
                  {editor && <td />}
                </tr>
              )}
            </tbody>
          </table></div>
        )}
      </div>
    </div>
  );
}
