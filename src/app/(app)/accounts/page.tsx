import Link from "next/link";
import { Fragment } from "react";
import { desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireBusiness } from "@/lib/auth";
import { accountBalances } from "@/lib/summary";
import { fmtDate, isISODate, money, r2, todayISO } from "@/lib/format";

export const metadata = { title: "Trial balance" };

const TYPE_LABEL = { asset: "Assets", liability: "Liabilities", equity: "Equity", income: "Income", expense: "Expenses" } as const;

export default async function Accounts({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await requireBusiness();
  const sp = await searchParams;
  const asAt = isISODate(sp.to) ? sp.to : todayISO();
  const year = asAt.slice(0, 4);
  const from = isISODate(sp.from) ? sp.from : `${year}-01-01`;
  const [tb, pl, recent] = await Promise.all([
    accountBalances(ctx.business.id, undefined, asAt),
    accountBalances(ctx.business.id, from, asAt),
    db.select().from(schema.journalEntries).where(eq(schema.journalEntries.businessId, ctx.business.id)).orderBy(desc(schema.journalEntries.date), desc(schema.journalEntries.createdAt)).limit(25),
  ]);
  const lines = recent.length ? await db.select({ l: schema.journalLines, a: schema.accounts }).from(schema.journalLines)
    .innerJoin(schema.accounts, eq(schema.accounts.id, schema.journalLines.accountId))
    .where(inArray(schema.journalLines.entryId, recent.map((e) => e.id))) : [];
  const byEntry = new Map<string, { name: string; code: string; debit: number; credit: number }[]>();
  for (const { l, a } of lines) {
    const arr = byEntry.get(l.entryId) ?? [];
    arr.push({ name: a.name, code: a.code, debit: l.debit, credit: l.credit });
    byEntry.set(l.entryId, arr);
  }
  const rows = tb.filter((r) => r.debit || r.credit);
  const dr = r2(rows.reduce((s, r) => s + Math.max(0, r.debit - r.credit), 0));
  const cr = r2(rows.reduce((s, r) => s + Math.max(0, r.credit - r.debit), 0));
  const income = pl.filter((r) => r.type === "income" && r.balance);
  const expenses = pl.filter((r) => r.type === "expense" && r.balance);
  const ti = r2(income.reduce((s, r) => s + r.balance, 0)), te = r2(expenses.reduce((s, r) => s + r.balance, 0));

  return (
    <div className="wrap">
      <div className="head"><div className="titles"><h1>Trial balance</h1>
        <p className="lede">Every book posts double entries to these accounts. Debits and credits always match; if they ever differ, a posting rule has failed.</p></div></div>
      <form className="period" method="get">
        <label className="row small muted" htmlFor="from">Income statement from <input id="from" name="from" type="date" defaultValue={from} /></label>
        <label className="row small muted" htmlFor="to">to <input id="to" name="to" type="date" defaultValue={asAt} /></label>
        <button type="submit">Apply</button>
      </form>
      <div className="cols">
        <section className="panel flush">
          <div className="panel-h" style={{ padding: "16px 18px 0" }}><h2>Balances at {fmtDate(asAt)}</h2>
            <span className={`chip dot ${dr === cr ? "ok" : "bad"}`}>{dr === cr ? "Balanced" : "Out of balance"}</span></div>
          <div className="tbl"><table>
            <thead><tr><th>Code</th><th>Account</th><th className="r">Debit</th><th className="r">Credit</th></tr></thead>
            <tbody>
              {rows.map((r) => { const net = r2(r.debit - r.credit); return (
                <tr key={r.id}><td className="d">{r.code}</td><td>{r.name} <span className="hint">{TYPE_LABEL[r.type as keyof typeof TYPE_LABEL]}</span></td>
                  <td className="r">{net > 0 ? money(net) : ""}</td><td className="r">{net < 0 ? money(-net) : ""}</td></tr>); })}
              {!rows.length && <tr><td colSpan={4} className="muted">No postings yet. Add entries to any book and they appear here.</td></tr>}
              <tr className="total"><td>Total</td><td /><td className="r">{money(dr)}</td><td className="r">{money(cr)}</td></tr>
            </tbody></table></div>
        </section>
        <section className="panel">
          <div className="panel-h"><h2>Income statement</h2><span className="hint">{fmtDate(from)} to {fmtDate(asAt)}</span></div>
          <dl className="kv">
            {income.map((r) => <Fragment key={r.id}><dt>{r.name}</dt><dd>{money(r.balance)}</dd></Fragment>)}
            <dt className="strong">Total income</dt><dd>{money(ti)}</dd>
            <div className="sep" />
            {expenses.map((r) => <Fragment key={r.id}><dt>{r.name}</dt><dd>{money(r.balance)}</dd></Fragment>)}
            <dt className="strong">Total expenses</dt><dd>{money(te)}</dd>
            <div className="sep" />
            <dt className="strong">{ti - te >= 0 ? "Profit" : "Loss"}</dt><dd className={ti - te < 0 ? "neg" : ""}>{money(ti - te)}</dd>
          </dl>
          <p className="hint" style={{ marginTop: 12 }}>Depreciation is included once you post it from the asset register.</p>
        </section>
      </div>
      <section className="panel flush">
        <div className="panel-h" style={{ padding: "16px 18px 0" }}><h2>Latest journal entries</h2></div>
        <div className="tbl"><table>
          <thead><tr><th>Date</th><th>Entry</th><th>Account</th><th className="r">Debit</th><th className="r">Credit</th></tr></thead>
          <tbody>{recent.flatMap((e) => (byEntry.get(e.id) ?? []).map((l, i) => (
            <tr key={e.id + i}><td className="d">{i === 0 ? fmtDate(e.date) : ""}</td><td>{i === 0 ? e.memo : ""}</td><td>{l.code} {l.name}</td>
              <td className="r">{l.debit ? money(l.debit) : ""}</td><td className="r">{l.credit ? money(l.credit) : ""}</td></tr>)))}
            {!recent.length && <tr><td colSpan={5} className="muted">No journal entries yet.</td></tr>}</tbody>
        </table></div>
      </section>
      <p className="hint">Need another account, such as a specific loan or grant? Ask the owner to add it in <Link href="/settings#accounts">setup</Link>.</p>
    </div>
  );
}
