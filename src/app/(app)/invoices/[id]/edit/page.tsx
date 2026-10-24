import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireBusiness } from "@/lib/auth";
import { getInvoice, isLocked, toDraft } from "@/lib/invoices";
import { KIND_LABEL } from "@/lib/nrs/core";
import { Flash } from "@/components/Flash";
import { InvoiceEditor } from "@/components/InvoiceEditor";
import { saveInvoiceAction } from "../../actions";
import { editorLists } from "../../editor-data";

export const metadata = { title: "Edit invoice" };

export default async function EditInvoice({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const ctx = await requireBusiness("accountant");
  const inv = await getInvoice(ctx.business.id, id);
  if (!inv) notFound();
  if (isLocked(inv)) redirect(`/invoices/${id}?err=${encodeURIComponent("A signed invoice cannot be changed. Issue a credit note instead.")}`);
  const lists = await editorLists(ctx.business.id);
  return (
    <div className="wrap">
      <div className="head"><div className="titles"><Link className="back" href={`/invoices/${id}`}>Back to {inv.number}</Link><h1>Edit {KIND_LABEL[inv.kind].toLowerCase()} {inv.number}</h1></div></div>
      <Flash ok={sp.ok} err={sp.err} />
      {inv.nrsStatus === "validated" && <p className="note warn">Saving changes sends this invoice back to draft. Validate it again before signing.</p>}
      <InvoiceEditor id={id} initial={toDraft(inv)} vatRate={ctx.business.vatRate} serviceId={ctx.business.nrsServiceId} {...lists} action={saveInvoiceAction} />
    </div>
  );
}
