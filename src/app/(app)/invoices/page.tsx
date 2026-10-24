import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { can, requireBusiness } from "@/lib/auth";
import { fmtDate, money } from "@/lib/format";
import { KIND_LABEL, NRS_STATUS_LABEL, PAY_LABEL } from "@/lib/nrs/core";
import { PROVIDERS } from "@/lib/nrs/providers";
import { Flash } from "@/components/Flash";
import { NRS_CHIP, PAY_CHIP } from "@/lib/ui";

export const metadata = { title: "E-invoices" };

export default async function Invoices({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await requireBusiness();
  const sp = await searchParams;
  const rows = await db.select().from(schema.invoices).where(eq(schema.invoices.businessId, ctx.business.id)).orderBy(desc(schema.invoices.issueDate), desc(schema.invoices.number));
  const provider = PROVIDERS.find((p) => p.id === ctx.business.nrsProvider);
  return (
    <div className="wrap">
      <div className="head">
        <div className="titles"><h1>E-invoices</h1>
          <p className="lede">Invoices in the NRS e-invoicing format. Each one is validated, gets an IRN, is signed through your NRS connection and carries the NRS QR code.</p></div>
        {can(ctx.role, "accountant") && <Link className="btn primary" href="/invoices/new">New invoice</Link>}
      </div>
      <Flash ok={sp.ok} err={sp.err} />
      <p className={`note${ctx.business.nrsProvider === "sandbox" ? " warn" : ""}`}>
        NRS connection: <b>{provider?.label}</b>. {ctx.business.nrsProvider === "sandbox" ? "Signatures are simulated and not valid for tax. Connect your live NRS or APP credentials in setup." : "Invoices are validated and signed live."}{" "}
        <Link href="/settings#nrs">Change connection</Link>
      </p>
      <div className="panel flush">
        {!rows.length ? (
          <div className="empty"><b>No e-invoices yet</b><span>Create your first invoice. Finish business setup first so it passes NRS validation.</span>
            {can(ctx.role, "accountant") && <Link className="btn primary" href="/invoices/new">New invoice</Link>}</div>
        ) : (
          <div className="tbl"><table>
            <thead><tr><th>Number</th><th>Type</th><th>Customer</th><th>Issued</th><th>Due</th><th className="r">Total</th><th>NRS status</th><th>Payment</th></tr></thead>
            <tbody>{rows.map((i) => (
              <tr key={i.id}>
                <td><Link className="rowlink" href={`/invoices/${i.id}`}>{i.number}</Link>{i.example && <> <span className="chip">Example</span></>}</td>
                <td>{KIND_LABEL[i.kind]}</td><td>{i.customer.name}</td><td className="d">{fmtDate(i.issueDate)}</td><td className="d">{fmtDate(i.dueDate)}</td>
                <td className="r">{money((i.kind === "credit" ? -1 : 1) * i.total)}</td>
                <td><span className={`chip dot ${NRS_CHIP[i.nrsStatus]}`}>{NRS_STATUS_LABEL[i.nrsStatus]}</span>{i.nrsSimulated && <> <span className="chip bad">Sandbox</span></>}</td>
                <td><span className={`chip dot ${PAY_CHIP[i.paymentStatus]}`}>{PAY_LABEL[i.paymentStatus]}</span></td>
              </tr>))}</tbody>
          </table></div>
        )}
      </div>
    </div>
  );
}
