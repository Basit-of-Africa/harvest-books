import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { getCtx } from "@/lib/auth";
import "./landing.css";

export const metadata: Metadata = {
  title: { absolute: "Harvest Books: bookkeeping and NRS e-invoicing for agribusiness" },
  description: "Keep your farm's cash book, sales, purchases, payroll and debtors in one place, and send every invoice through NRS e-invoicing with its IRN and QR code.",
};
export const viewport: Viewport = { colorScheme: "light", themeColor: "#FFFFFF" };

const SIGNUP = "/signup";

function Mark() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="#1D5A3E" />
      <path d="M9 9h14M9 14h14M9 19h9" stroke="#fff" strokeOpacity=".35" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M16 25c0-6 3.5-9.5 8-10.5-.6 5.4-3.6 9.2-8 10.5Zm0 0c0-4.6-2.6-7.4-6-8.2.4 4.2 2.7 7.2 6 8.2Z" fill="#9FD7B5" />
    </svg>
  );
}

const Icon = {
  hash: <path d="M5 9h14M5 15h14M10 4 8 20M16 4l-2 16" />,
  check: <path d="M4 12.5 9 17.5 20 6.5" />,
  qr: <><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><path d="M14 14h2v2h-2zM18 18h2v2h-2zM14 18h2M18 14h2" /></>,
  sync: <path d="M20 8a8 8 0 0 0-14.5-2M4 4v4h4M4 16a8 8 0 0 0 14.5 2M20 20v-4h-4" />,
  undo: <path d="M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3" />,
};
const Ic = ({ d }: { d: React.ReactNode }) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>;

function Shot({ src, alt, w = 2160, h = 1350 }: { src: string; alt: string; w?: number; h?: number }) {
  return (
    <div className="frame">
      <div className="bar" aria-hidden="true"><i /><i /><i /></div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} width={w} height={h} loading="lazy" decoding="async" />
    </div>
  );
}

const FEATURES = [
  {
    id: "cash", eyebrow: "Cash book", title: "Know your cash position every day.",
    body: "Every naira in and out of the bank and the cash box, with a running balance from your opening figure. Sales, purchases, wages and petty cash top-ups paid in cash land here on their own.",
    points: ["Running balance, exactly like the paper cash book", "Each line tagged to what it was for", "Export to CSV for your bank reconciliation"],
    img: "/marketing/cash.jpg", alt: "Cash book with money in, money out and running balance",
  },
  {
    id: "sales", eyebrow: "Sales and purchases", title: "Every bag sold, every input bought.",
    body: "Record maize, soybean and cassava sales the way you already do: quantity times price. Record seed, fertiliser and tractor hire the same way. Credit sales become debtors and credit purchases become creditors.",
    points: ["Cash, transfer, POS or credit on every line", "Output and input VAT kept apart", "Totals for any month or season"],
    img: "/marketing/sales.jpg", alt: "Sales book listing customers, products, quantities and amounts",
  },
  {
    id: "einvoicing", eyebrow: "NRS e-invoicing", title: "Invoices NRS signs, not just accepts.", nrs: true,
    body: "Create the invoice, and Harvest Books checks it against the NRS e-invoice fields, gives it an IRN, sends it for signing and prints the QR code on it. Paid or part-paid, the status goes back to NRS too.",
    points: ["IRN built from your invoice number and Service ID", "Validate, sign and transmit from one page", "Branded PDF with the NRS seal, sent by email"],
    img: "/marketing/invoice.jpg", alt: "Signed invoice with the NRS QR code, IRN and submission steps",
  },
  {
    id: "debtors", eyebrow: "Debtors and creditors", title: "See who owes you, and who you owe.",
    body: "Credit sales, credit purchases and posted invoices all add a balance here. Record money as it comes in and the cash book, the debtor and the invoice update together.",
    points: ["Overdue balances flagged against today's date", "Part-payments tracked to the naira", "Balances brought forward from your old books"],
    img: "/marketing/parties.jpg", alt: "Debtors and creditors ledger with paid and outstanding amounts",
  },
  {
    id: "payroll", eyebrow: "Payroll and assets", title: "Farm hands paid, pumps depreciated.",
    body: "Days worked times the rate for every hand on the farm, paid straight from the cash book. Tractors, pumps and dryers sit in the asset register with straight-line depreciation to today.",
    points: ["Wages by day, hour or month", "Depreciation to date and book value", "Post depreciation to the journal when you are ready"],
    img: "/marketing/payroll.jpg", alt: "Payroll book with staff, days worked, rates and amounts paid",
  },
  {
    id: "team", eyebrow: "Team", title: "Bring your accountant into the books.",
    body: "Invite your accountant, store keeper or partner with the right access. Owners control setup and NRS credentials; accountants post entries and sign invoices; viewers read without changing anything.",
    points: ["Owner, accountant and viewer roles", "One login for several businesses", "Invitations by email or link"],
    img: "/marketing/team.jpg", alt: "Team page showing members and their roles",
  },
];

const FAQ: [string, React.ReactNode][] = [
  ["What is Harvest Books?", <><p>An online bookkeeping app for farms and agribusinesses. It keeps the nine books of a simple bookkeeping pack (cash book, sales, purchases, petty cash, inventory, payroll, asset register, debtors and creditors) with a double-entry journal underneath, and it issues invoices in the NRS e-invoicing format.</p></>],
  ["Does it connect to NRS directly?", <><p>Yes. Each business chooses its connection in setup: directly to the NRS e-invoicing service with the API key and secret from your NRS profile, or through your Access Point Provider. Until you add credentials, a built-in sandbox lets you try the whole flow; sandbox invoices are clearly marked as not valid for tax.</p></>],
  ["Does my business have to use e-invoicing?", <><p>NRS is rolling e-invoicing out to taxpayers in stages. Check with NRS or your tax adviser whether and when your business is in scope. Harvest Books works either way: the books stand on their own, and e-invoicing is there when you need it.</p></>],
  ["How is VAT handled for farm produce?", <><p>Every invoice line has a tax category: standard VAT at 7.5%, zero-rated or exempt. Many unprocessed agricultural products are zero-rated or exempt, so you set the category per product and confirm the treatment with your tax adviser. The summary shows output VAT, input VAT and the net amount for any period.</p></>],
  ["Can I move over from my spreadsheet?", <><p>Yes. The books follow the same columns and formulas as the Simple Bookkeeping Pack. Enter your opening cash balance and petty cash float, add debtors and creditors brought forward, and carry on from there. Every book exports back to CSV whenever you want it.</p></>],
  ["Can my accountant work in the books with me?", <><p>Yes. Invite them as an accountant to post entries and sign invoices, or as a viewer to read only. Only owners can change setup and NRS credentials.</p></>],
  ["How are my NRS credentials kept safe?", <><p>API keys and secrets are encrypted before they are stored and are never sent back to the browser. Every call to NRS is logged on the invoice, with secrets removed from the log.</p></>],
];

export default async function Landing() {
  const ctx = await getCtx().catch(() => null);
  const signedIn = !!ctx;
  const startHref = signedIn ? "/dashboard" : SIGNUP;
  const startLabel = signedIn ? "Open your books" : "Create your account";

  return (
    <div className="lp">
      <header className="topbar">
        <div className="wrap">
          <Link href="/" className="mark" aria-label="Harvest Books home"><Mark />Harvest Books</Link>
          <nav aria-label="Sections"><ul>
            <li><a href="#product">Product</a></li>
            <li><a href="#einvoicing">E-invoicing</a></li>
            <li><a href="#who">Who it&apos;s for</a></li>
            <li><a href="#faq">FAQ</a></li>
          </ul></nav>
          <div className="right">
            {!signedIn && <Link className="signin" href="/login">Sign in</Link>}
            <Link className="btn primary small" href={startHref}>{signedIn ? "Open your books" : "Get started"}</Link>
          </div>
        </div>
      </header>

      <main>
        <div className="hero">
          <div className="wrap">
            <a className="pill" href="#einvoicing"><b>New</b>NRS e-invoicing built in</a>
            <h1>Farm books that keep you ready for NRS.</h1>
            <p className="lead">Harvest Books turns your cash book, sales book and the rest of the bookkeeping pack into one simple app, and sends every invoice through NRS e-invoicing with its IRN and QR code.</p>
            <div className="ctas">
              <Link className="btn primary" href={startHref}>{startLabel}</Link>
              <a className="btn line" href="#einvoicing">See how e-invoicing works</a>
            </div>
            <div className="stage">
              <Shot src="/marketing/dashboard.jpg" alt="Harvest Books monthly summary showing cash at bank, sales, purchases, profit and a monthly cash chart" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="seal-float" src="/marketing/seal.png" alt="NRS e-invoice seal with QR code, IRN and CSID" width={880} height={300} />
            </div>
          </div>
        </div>

        <section className="tint" id="product">
          <div className="wrap suite">
            <div className="sec-head">
              <span className="eyebrow">One set of books</span>
              <h2>Nine books, one journal, every invoice signed.</h2>
              <p className="lead">Every entry you make posts a balanced double entry underneath, so the summary, the VAT figures and the trial balance always agree with your books. You keep the familiar columns; the accounting takes care of itself.</p>
              <div className="books-list">{["Cash book", "Sales", "Purchases", "Petty cash", "Inventory", "Payroll", "Assets", "Debtors", "Creditors"].map((b) => <span key={b}>{b}</span>)}</div>
              <Link className="btn primary" href={startHref}>{startLabel}</Link>
            </div>
            <Shot src="/marketing/accounts.jpg" alt="Trial balance and income statement, balanced" />
          </div>
        </section>

        <section>
          <div className="wrap">
            <div className="sec-head">
              <span className="eyebrow">What&apos;s inside</span>
              <h2>Everything a growing agribusiness keeps.</h2>
            </div>
            <div className="features">
              {FEATURES.map((f, i) => (
                <article key={f.id} id={f.id} className={`feature${i % 2 ? " flip" : ""}${f.nrs ? " nrs" : ""}`}>
                  <div className="copy">
                    <span className={`eyebrow${f.nrs ? " stamp" : ""}`}>{f.eyebrow}</span>
                    <h3>{f.title}</h3>
                    <p>{f.body}</p>
                    <ul>{f.points.map((pt) => <li key={pt}>{pt}</li>)}</ul>
                    <Link className="btn primary" href={startHref}>{signedIn ? "Open your books" : "Start keeping books"}</Link>
                  </div>
                  <div className="shot"><Shot src={f.img} alt={f.alt} /></div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="tint">
          <div className="wrap quote">
            <span className="eyebrow">Where it started</span>
            <blockquote>&ldquo;Start with the cash book, sales book and purchases book. These alone will show whether the business is making money.&rdquo;</blockquote>
            <cite><b>The Simple Bookkeeping Pack</b>, the spreadsheet Harvest Books is built on</cite>
          </div>
        </section>

        <section id="who">
          <div className="wrap">
            <div className="sec-head center">
              <span className="eyebrow">Who it&apos;s for</span>
              <h2>Built for agribusinesses at every stage.</h2>
              <p className="lead">From a family farm selling at the market to a cooperative invoicing feed mills, the same books grow with you.</p>
            </div>
            <div className="cards">
              {[
                { who: "Farms and growers", h: "Know if the season paid.", p: "Cash, sales, inputs and wages in one place, with a monthly summary that tells you where the money went.", img: "/marketing/dashboard.jpg" },
                { who: "Aggregators and processors", h: "Invoice buyers the way NRS expects.", p: "B2B invoices with your customer's TIN, HS codes and the right VAT category, validated and signed before they leave.", img: "/marketing/invoices.jpg" },
                { who: "Cooperatives and agri-consultancies", h: "Several books, one team.", p: "Run books for more than one business, give each person the right access, and keep NRS credentials locked to the owner.", img: "/marketing/team.jpg" },
              ].map((c) => (
                <Link key={c.who} className="card" href={startHref}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <div className="pic"><img src={c.img} alt="" loading="lazy" /></div>
                  <div className="body"><span className="aud">{c.who}</span><h4>{c.h}</h4><p>{c.p}</p><span className="more">{signedIn ? "Open your books" : "Get started"}</span></div>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section className="tint">
          <div className="wrap">
            <div className="sec-head">
              <span className="eyebrow">On day one</span>
              <h2>Proper books without an accounting degree.</h2>
            </div>
            <div className="facts">
              <div className="fact"><span className="n">9</span><b>Linked books</b><span>The full bookkeeping pack, from cash book to asset register</span></div>
              <div className="fact"><span className="n">4</span><b>Steps to a signed invoice</b><span>Validate, sign, transmit, post to your books</span></div>
              <div className="fact"><span className="n">7.5%</span><b>VAT worked out for you</b><span>Plus zero-rated and exempt lines for farm produce</span></div>
              <div className="fact"><span className="n">3</span><b>Roles for your team</b><span>Owner, accountant and viewer</span></div>
            </div>
          </div>
        </section>

        <section id="compliance">
          <div className="wrap comply">
            <div className="paper">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/marketing/invoice-paper.jpg" alt="A signed invoice with the NRS QR seal" loading="lazy" />
            </div>
            <div>
              <div className="sec-head">
                <span className="eyebrow stamp">NRS e-invoicing</span>
                <h2>Compliant from the first invoice.</h2>
                <p className="lead">The e-invoice rules are handled for you, step by step, with every call to NRS recorded on the invoice.</p>
              </div>
              <div className="rules">
                <div className="rule"><span className="ic"><Ic d={Icon.hash} /></span><div><h4>An IRN on every invoice</h4><p>Built from your invoice number, NRS Service ID and issue date, and confirmed with NRS before signing.</p></div></div>
                <div className="rule"><span className="ic"><Ic d={Icon.check} /></span><div><h4>Checked before it is sent</h4><p>Your TIN, the buyer&apos;s TIN, HS codes, product categories and tax categories are checked against the required fields, with plain-language fixes.</p></div></div>
                <div className="rule"><span className="ic"><Ic d={Icon.qr} /></span><div><h4>Signed and stamped</h4><p>The cryptographic stamp and QR code from NRS are printed in the seal on the invoice and the PDF.</p></div></div>
                <div className="rule"><span className="ic"><Ic d={Icon.sync} /></span><div><h4>Payments kept in step</h4><p>Mark an invoice paid or part-paid and the cash book, the debtor and NRS are all updated.</p></div></div>
                <div className="rule"><span className="ic"><Ic d={Icon.undo} /></span><div><h4>Corrections done properly</h4><p>Signed invoices are locked. Credit notes reference the original IRN and reverse it in your books.</p></div></div>
              </div>
            </div>
          </div>
        </section>

        <section className="tint">
          <div className="wrap">
            <div className="sec-head">
              <span className="eyebrow">Why Harvest Books</span>
              <h2>You run the farm. We keep the books straight.</h2>
            </div>
            <div className="reasons">
              <div className="reason wide lead-card"><h4>Start with the books you already know</h4><p>The same columns and formulas as the bookkeeping pack, so nobody has to learn accounting to use it.</p><Link className="btn" href={startHref}>{startLabel}</Link></div>
              <div className="reason wide"><span className="tag">Nigeria first</span><h4>Made for how Nigerian farms trade</h4><p>Naira throughout, TIN and +234 numbers, 7.5% VAT with zero-rated produce, and NRS e-invoicing built in rather than bolted on.</p></div>
              <div className="reason"><h4>Double entry, quietly</h4><p>Each entry posts balanced debits and credits. The trial balance tells you the moment anything is off.</p></div>
              <div className="reason"><h4>Locked-down credentials</h4><p>NRS keys are encrypted at rest and only the owner can see or change the connection.</p></div>
              <div className="reason"><h4>Your data stays yours</h4><p>Export any book to CSV and any invoice to PDF, whenever you like.</p></div>
            </div>
          </div>
        </section>

        <section id="faq">
          <div className="wrap faq">
            <div className="sec-head">
              <span className="eyebrow">FAQ</span>
              <h2>Questions? Here are the answers.</h2>
              <p className="lead">Anything else, ask from inside the app once you have an account.</p>
            </div>
            <div>{FAQ.map(([q, a], i) => (
              <details key={q} open={i === 0}><summary>{q}</summary><div className="ans">{a}</div></details>
            ))}</div>
          </div>
        </section>

        <div className="wrap">
          <div className="closing">
            <h2>Your books, in order, from today.</h2>
            <p>Set up your business, add your opening balances and send your first NRS e-invoice in the same afternoon.</p>
            <div className="row" style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
              <Link className="btn primary" href={startHref}>{startLabel}</Link>
              {!signedIn && <Link className="btn line" href="/login">Sign in</Link>}
            </div>
          </div>
        </div>
      </main>

      <footer>
        <div className="wrap">
          <div className="cols">
            <div className="about"><Link href="/" className="mark"><Mark />Harvest Books</Link><p>Bookkeeping and NRS e-invoicing for Nigerian farms and agribusinesses.</p></div>
            <div><h5>Product</h5><ul><li><a href="#cash">Cash book</a></li><li><a href="#sales">Sales and purchases</a></li><li><a href="#einvoicing">E-invoicing</a></li><li><a href="#debtors">Debtors and creditors</a></li><li><a href="#team">Team</a></li></ul></div>
            <div><h5>Account</h5><ul><li><Link href="/login">Sign in</Link></li><li><Link href={SIGNUP}>Create an account</Link></li></ul></div>
            <div><h5>Resources</h5><ul><li><a href="#faq">FAQ</a></li><li><a href="https://einvoice.nrs.gov.ng/docs/introduction?version=1.1" target="_blank" rel="noreferrer">NRS e-invoicing documentation</a></li></ul></div>
          </div>
          <div className="base"><span>© 2026 Harvest Books. All rights reserved.</span><span>Made for agribusiness in Nigeria</span></div>
        </div>
      </footer>
    </div>
  );
}
