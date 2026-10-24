import Link from "next/link";
import { requireBusiness } from "@/lib/auth";
import { getInvoice, nextNumber } from "@/lib/invoices";
import { addDays, nowTimeWAT, todayISO } from "@/lib/format";
import { KIND_LABEL, type InvoiceDraft } from "@/lib/nrs/core";
import { Flash } from "@/components/Flash";
import { InvoiceEditor } from "@/components/InvoiceEditor";
import { saveInvoiceAction } from "../actions";
import { editorLists } from "../editor-data";

export const metadata = { title: "New invoice" };

export default async function NewInvoice({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await requireBusiness("accountant");
  const sp = await searchParams;
  const kind = sp.kind === "credit" || sp.kind === "debit" ? sp.kind : "invoice";
  const from = sp.from ? await getInvoice(ctx.business.id, sp.from) : null;
  const today = todayISO();
  const draft: InvoiceDraft = {
    kind, transactionType: from?.transactionType ?? "B2B", number: await nextNumber(ctx.business, kind),
    issueDate: today, issueTime: nowTimeWAT(), dueDate: kind === "invoice" ? addDays(today, 30) : null,
    paymentMeans: "30", paymentStatus: "PENDING",
    customer: from?.customer ?? { name: "", tin: "", email: "", phone: "", street: "", city: "", postalCode: "", country: "NG" },
    lines: from?.lines ?? [], note: from ? `${KIND_LABEL[kind]} against ${from.number}.` : "",
    refIrn: from?.irn ?? "", refDate: from?.issueDate ?? null,
  };
  const lists = await editorLists(ctx.business.id);
  return (
    <div className="wrap">
      <div className="head"><div className="titles"><Link className="back" href="/invoices">Back to e-invoices</Link><h1>New {KIND_LABEL[kind].toLowerCase()}</h1></div></div>
      <Flash ok={sp.ok} err={sp.err} />
      <InvoiceEditor initial={draft} vatRate={ctx.business.vatRate} serviceId={ctx.business.nrsServiceId} {...lists} action={saveInvoiceAction} />
    </div>
  );
}
