"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireBusiness } from "@/lib/auth";
import { attempt, back, str } from "@/lib/flash";
import { toNum } from "@/lib/format";
import { getInvoice, isLocked, postInvoice, recordSignature, saveInvoice, setPayment, signWithNrs, transmitWithNrs, validateWithNrs, type NrsOutcome } from "@/lib/invoices";
import { invoicePdf } from "@/lib/pdf";
import { mailConfigured, sendMail } from "@/lib/mail";
import { KIND_LABEL } from "@/lib/nrs/core";
import { removeInvoicePosting } from "@/lib/posting";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const Draft = z.object({
  kind: z.enum(["invoice", "credit", "debit"]),
  transactionType: z.enum(["B2B", "B2G", "B2C"]),
  number: z.string().trim().min(1, "Add an invoice number.").max(30),
  issueDate: date, issueTime: z.string().trim().default("00:00:00"),
  dueDate: date.nullable().or(z.literal("").transform(() => null)),
  paymentMeans: z.string(), paymentStatus: z.enum(["PENDING", "PARTIAL", "PAID"]).default("PENDING"),
  customer: z.object({ name: z.string().trim(), tin: z.string().trim(), email: z.string().trim(), phone: z.string().trim(), street: z.string().trim(), city: z.string().trim(), postalCode: z.string().trim(), country: z.string().trim().toUpperCase() }),
  lines: z.array(z.object({
    name: z.string().trim(), description: z.string().trim().default(""), hsCode: z.string().trim(), category: z.string().trim(),
    quantity: z.coerce.number(), unit: z.string(), price: z.coerce.number(), discount: z.coerce.number().default(0), taxCategory: z.string(),
  })).max(100),
  note: z.string().max(1000).default(""), refIrn: z.string().trim().default(""),
  refDate: date.nullable().or(z.literal("").transform(() => null)),
});

export async function saveInvoiceAction(fd: FormData) {
  const ctx = await requireBusiness("accountant");
  const id = str(fd, "id") || undefined;
  const intent = str(fd, "intent");
  const here = id ? `/invoices/${id}/edit` : "/invoices/new";
  let parsed;
  try { parsed = Draft.safeParse(JSON.parse(String(fd.get("payload") ?? "{}"))); } catch { back(here, "err", "The invoice form could not be read. Reload and try again."); }
  if (!parsed.success) back(here, "err", parsed.error.issues[0]?.message ?? "Check the invoice fields.");
  const res = await attempt(() => saveInvoice(ctx.business, ctx.user.id, parsed.data, id));
  if (!res.ok) back(here, "err", res.error);
  const newId = res.value;
  revalidatePath("/", "layout");
  if (intent === "validate") {
    const inv = (await getInvoice(ctx.business.id, newId))!;
    const out = await validateWithNrs(ctx.business, inv);
    finish(newId, out);
  }
  back(`/invoices/${newId}`, "ok", "Draft saved.");
}

function finish(id: string, out: NrsOutcome): never {
  revalidatePath("/", "layout");
  const extra: Record<string, string> = out.errors?.length ? { errs: JSON.stringify(out.errors.slice(0, 12)) } : {};
  back(`/invoices/${id}`, out.ok ? "ok" : "err", out.message, extra);
}

async function load(fd: FormData, min: "accountant" | "owner" = "accountant") {
  const ctx = await requireBusiness(min);
  const id = str(fd, "id");
  const inv = await getInvoice(ctx.business.id, id);
  if (!inv) back("/invoices", "err", "That invoice no longer exists.");
  return { ctx, inv };
}

export async function nrsAction(fd: FormData) {
  const { ctx, inv } = await load(fd);
  const step = str(fd, "step");
  const res = await attempt(async () => {
    switch (step) {
      case "validate": return validateWithNrs(ctx.business, inv);
      case "sign": return signWithNrs(ctx.business, inv);
      case "record": return recordSignature(ctx.business, inv, str(fd, "csid"), str(fd, "qr"), str(fd, "signedOn"));
      case "transmit": return transmitWithNrs(ctx.business, inv);
      case "post": return postInvoice(ctx.business, inv, ctx.user.id);
      case "reset": {
        if (isLocked(inv)) return { ok: false, message: "A signed invoice cannot go back to draft." };
        await db.update(schema.invoices).set({ nrsStatus: "draft", irn: "", nrsErrors: [], updatedAt: new Date() }).where(eq(schema.invoices.id, inv.id));
        return { ok: true, message: "Back to draft. Edit and validate again." };
      }
      default: return { ok: false, message: "Unknown step." };
    }
  });
  finish(inv.id, res.ok ? res.value : { ok: false, message: res.error });
}

export async function paymentAction(fd: FormData) {
  const { ctx, inv } = await load(fd);
  const res = await attempt(() => setPayment(ctx.business, inv, str(fd, "status"), toNum(str(fd, "paid")), ctx.user.id));
  finish(inv.id, res.ok ? res.value : { ok: false, message: res.error });
}

export async function deleteInvoice(fd: FormData) {
  const { ctx, inv } = await load(fd);
  if (isLocked(inv) || inv.postedAt) back(`/invoices/${inv.id}`, "err", "Signed invoices are kept for your records. Issue a credit note instead.");
  await db.transaction(async (tx) => {
    await removeInvoicePosting(tx, ctx.business.id, inv.id);
    await tx.delete(schema.invoices).where(and(eq(schema.invoices.id, inv.id), eq(schema.invoices.businessId, ctx.business.id)));
  });
  revalidatePath("/", "layout");
  back("/invoices", "ok", `${inv.number} deleted.`);
}

export async function emailInvoice(fd: FormData) {
  const { ctx, inv } = await load(fd);
  const to = str(fd, "to");
  if (!mailConfigured()) back(`/invoices/${inv.id}`, "err", "Email is not set up on this server. See the README for the SMTP settings.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(to)) back(`/invoices/${inv.id}`, "err", "Enter a valid email address.");
  const res = await attempt(async () => {
    const pdf = await invoicePdf(ctx.business, inv);
    const label = KIND_LABEL[inv.kind];
    await sendMail({
      to, replyTo: ctx.business.email || undefined,
      subject: `${label} ${inv.number} from ${ctx.business.name}`,
      text: [`Hello ${inv.customer.name || ""},`.trim(), "", `Please find ${label.toLowerCase()} ${inv.number} attached, for a total of NGN ${toNum(inv.total).toLocaleString("en-NG", { minimumFractionDigits: 2 })}.`,
        inv.irn ? `NRS Invoice Reference Number: ${inv.irn}` : "", inv.dueDate ? `Due date: ${inv.dueDate}` : "", "", ctx.business.bankDetails, "", `${ctx.business.name}`].filter((l) => l !== undefined).join("\n"),
      attachments: [{ filename: `${inv.number}.pdf`, content: Buffer.from(pdf), contentType: "application/pdf" }],
    });
    await db.update(schema.invoices).set({ emailedAt: new Date() }).where(eq(schema.invoices.id, inv.id));
  });
  if (!res.ok) back(`/invoices/${inv.id}`, "err", `The email was not sent: ${res.error}`);
  back(`/invoices/${inv.id}`, "ok", `Sent to ${to}.`);
}

export async function newCreditNote(fd: FormData) {
  const { inv } = await load(fd);
  redirect(`/invoices/new?kind=credit&from=${inv.id}`);
}
