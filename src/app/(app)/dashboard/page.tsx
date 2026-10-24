import Link from "next/link";
import { and, asc, eq, isNull, lt, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireBusiness } from "@/lib/auth";
import { bookTotals, journalSummary, monthlyCash } from "@/lib/summary";
import { MONTHS, compactMoney, fmtDate, isISODate, money, r2, todayISO } from "@/lib/format";
import { Flash } from "@/components/Flash";

export const metadata = { title: "Monthly summary" };

function presets(today: string) {
  const [y, m] = today.split("-").map(Number);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return {
    month: { label: "This month", from: iso(new Date(Date.UTC(y, m - 1, 1))), to: iso(new Date(Date.UTC(y, m, 0))) },
    last: { label: "Last month", from: iso(new Date(Date.UTC(y, m - 2, 1))), to: iso(new Date(Date.UTC(y, m - 1, 0))) },
    ytd: { label: "Year to date", from: `${y}-01-01`, to: today },
    all: { label: "All time", from: "", to: "" },
  } as Record<string, { label: string; from: string; to: string }>;
}

export default async function Dashboard({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await requireBusiness();
  const b = ctx.business;
  const sp = await searchParams;
  const today = todayISO();
  const P = presets(today);
  const preset = sp.p && P[sp.p] ? sp.p : sp.from || sp.to ? "custom" : "ytd";
  const from = preset === "custom" ? (isISODate(sp.from) ? sp.from : "") : P[preset].from;
  const to = preset === "custom" ? (isISODate(sp.to) ? sp.to : "") : P[preset].to;

  const [t, j, chart, overdue, unsigned] = await Promise.all([
    bookTotals(b.id, from || undefined, to || undefined),
    journalSummary(b.id, from || undefined, to || undefined),
    monthlyCash(b.id, (to || today).slice(0, 4)),
    db.select().from(schema.parties).where(and(eq(schema.parties.businessId, b.id), lt(schema.parties.dueDate, today), sql`${schema.parties.amount} > ${schema.parties.paid}`)).orderBy(asc(schema.parties.dueDate)).limit(6),
    db.select({ n: sql<number>`count(*)::int` }).from(schema.invoices).where(and(eq(schema.invoices.businessId, b.id), sql`${schema.invoices.nrsStatus} in ('draft','validated','failed')`, isNull(schema.invoices.postedAt))),
  ]);
  const signedReal = await db.select({ n: sql<number>`count(*)::int` }).from(schema.invoices).where(and(eq(schema.invoices.businessId, b.id), sql`${schema.invoices.nrsStatus} in ('signed','transmitted')`, eq(schema.invoices.nrsSimulated, false)));
  const netVat = r2(j.outputVat - j.inputVat);
  const ready: [boolean, string][] = [
    [!!(b.name && b.tin), "Business name and TIN"],
    [/^[0-9a-f-]{36}$/i.test(b.nrsBusinessId), "NRS Business ID"],
    [/^[A-Za-z0-9]{8}$/.test(b.nrsServiceId), "NRS Service ID for IRNs"],
    [/^\+234\d{10}$/.test(b.phone) && !!b.email, "Business email and +234 phone"],
    [!!(b.street && b.city), "Business address"],
    [b.nrsProvider !== "sandbox", "Live NRS connection"],
    [signedReal[0].n > 0, "First invoice signed by NRS"],
  ];

  const max = Math.max(1, ...chart.ins, ...chart.outs);
  const W = 720, H = 230, L = 56, B = 26, T = 12, cw = (W - L - 8) / 12, bw = Math.min(16, cw / 3);
  const y = (v: number) => T + (H - T - B) * (1 - v / max);
  const year = (to || today).slice(0, 4);
  const Fig = ({ k, v, s, lead }: { k: string; v: number; s?: string; lead?: boolean }) => (
    <div className={`fig${lead ? " lead" : ""}`}><span className="k">{k}</span><span className={`v${!lead && v < 0 ? " neg" : ""}`}>{money(v)}</span>{s && <span className="s">{s}</span>}</div>
  );

  return (
    <div className="wrap">
      <div className="head"><div className="titles"><h1>Monthly summary</h1><p className="lede">Totals for the period you choose, pulled from every book, with profit and VAT from the double-entry journal underneath.</p></div></div>
      <Flash ok={sp.ok} err={sp.err} />
      <form className="period" method="get">
        <nav className="seg" aria-label="Period">
          {Object.entries(P).map(([k, v]) => <Link key={k} href={`/dashboard?p=${k}`} aria-current={preset === k ? "true" : undefined}>{v.label}</Link>)}
        </nav>
        <label className="row small muted" htmlFor="from">From <input id="from" name="from" type="date" defaultValue={from} /></label>
        <label className="row small muted" htmlFor="to">to <input id="to" name="to" type="date" defaultValue={to} /></label>
        <button type="submit">Apply</button>
      </form>

      <div className="figs">
        <Fig lead k="Cash at bank and in hand" v={j.cash} s={`Petty cash ${money(j.petty)}`} />
        <Fig k="Total sales" v={t.sales} s="Sales book, before VAT" />
        <Fig k="Total purchases" v={t.purchases} s="Purchases book" />
        <Fig k="Gross margin" v={t.grossMargin} s="Sales less purchases" />
        <Fig k="Total cash in" v={t.cashIn} s="Cash book" />
        <Fig k="Total cash out" v={t.cashOut} s="Cash book" />
        <Fig k="Net cash flow" v={t.netCash} s="Cash in less cash out" />
        <Fig k="Profit for the period" v={j.profit} s={`Payroll ${money(t.payroll)}, petty cash ${money(t.petty)}`} />
      </div>

      <div className="cols">
        <section className="panel">
          <div className="panel-h"><h2>Cash in and out by month, {year}</h2><div className="legend"><span><i style={{ background: "var(--ledger)" }} />Money in</span><span><i style={{ background: "var(--muted)" }} />Money out</span></div></div>
          <div className="chart">
            <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Cash in and out by month for ${year}`}>
              {[0, max / 2, max].map((v, i) => (<g key={i}><line x1={L} x2={W - 8} y1={y(v)} y2={y(v)} stroke="var(--rule)" /><text x={L - 8} y={y(v) + 4} textAnchor="end" fontSize="11" fill="var(--muted)">{compactMoney(v)}</text></g>))}
              {MONTHS.map((mn, i) => {
                const cx = L + cw * i + cw / 2;
                return (<g key={mn}>
                  <rect x={cx - bw - 1} y={y(chart.ins[i])} width={bw} height={Math.max(0, H - B - y(chart.ins[i]))} rx="2" fill="var(--ledger)"><title>{`${mn} in ${money(chart.ins[i])}`}</title></rect>
                  <rect x={cx + 1} y={y(chart.outs[i])} width={bw} height={Math.max(0, H - B - y(chart.outs[i]))} rx="2" fill="var(--muted)"><title>{`${mn} out ${money(chart.outs[i])}`}</title></rect>
                  <text x={cx} y={H - 8} textAnchor="middle" fontSize="11" fill="var(--muted)">{mn}</text></g>);
              })}
            </svg>
          </div>
        </section>
        <section className="panel">
          <div className="panel-h"><h2>VAT for the period</h2></div>
          <dl className="kv">
            <dt>Output VAT charged</dt><dd>{money(j.outputVat)}</dd>
            <dt>Input VAT paid</dt><dd>{money(j.inputVat)}</dd>
            <div className="sep" />
            <dt className="strong">{netVat >= 0 ? "Net VAT payable" : "Net VAT recoverable"}</dt><dd>{money(Math.abs(netVat))}</dd>
            <div className="sep" />
            <dt>Invoices not yet signed</dt><dd>{unsigned[0].n ? <Link href="/invoices" className="chip warn dot">{unsigned[0].n}</Link> : "0"}</dd>
          </dl>
          <p className="hint" style={{ marginTop: 12 }}>From the journal: VAT on cash sales, purchases and posted e-invoices.</p>
        </section>
      </div>

      <div className="cols">
        <section className="panel">
          <div className="panel-h"><h2>Owed to you and by you</h2><Link className="btn ghost" href="/books/parties">Open ledger</Link></div>
          <dl className="kv"><dt>Debtors owe you</dt><dd>{money(j.receivable)}</dd><dt>You owe creditors</dt><dd>{money(j.payable)}</dd></dl>
          {overdue.length ? (
            <div className="tbl" style={{ marginTop: 14 }}><table><thead><tr><th>Overdue</th><th>Due</th><th className="r">Outstanding</th></tr></thead>
              <tbody>{overdue.map((p) => <tr key={p.id}><td>{p.name} <span className={`chip ${p.kind === "Debtor" ? "ledger" : "stamp"}`}>{p.kind}</span></td><td className="d">{fmtDate(p.dueDate)}</td><td className="r">{money(p.amount - p.paid)}</td></tr>)}</tbody></table></div>
          ) : <p className="muted small" style={{ marginTop: 12 }}>Nothing overdue.</p>}
        </section>
        <section className="panel">
          <div className="panel-h"><h2>E-invoicing readiness</h2><Link className="btn ghost" href="/settings">Open setup</Link></div>
          <ul className="checklist">{ready.map(([ok, l]) => <li key={l}><span className={`tick${ok ? " on" : ""}`} aria-hidden="true" /><span>{l}{!ok && <span className="muted small"> to do</span>}</span></li>)}</ul>
        </section>
      </div>
    </div>
  );
}
