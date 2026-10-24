import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import QRCode from "qrcode";
import { schema } from "@/db";
import { fmtDate, toNum } from "./format";
import { KIND_LABEL, PAYMENT_MEANS, TAX_CATEGORIES, calcInvoice } from "./nrs/core";

type Business = typeof schema.businesses.$inferSelect;
type Invoice = typeof schema.invoices.$inferSelect;

/* Standard PDF fonts cannot draw the naira sign, so amounts print as NGN. */
const ngn = (n: number) => "NGN " + toNum(n).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const ascii = (s: string) => String(s ?? "").replace(/₦/g, "NGN ").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—−]/g, "-").replace(/[^\x20-\x7E\n]/g, "");

function hex(c: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(c) ?? ["", "1D5A3E"];
  const n = parseInt(m[1], 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = [];
  for (const para of ascii(text).split("\n")) {
    let line = "";
    for (const w of para.split(/\s+/)) {
      const t = line ? line + " " + w : w;
      if (font.widthOfTextAtSize(t, size) > width && line) { out.push(line); line = w; } else line = t;
    }
    out.push(line);
  }
  return out;
}

export async function invoicePdf(b: Business, inv: Invoice): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`${KIND_LABEL[inv.kind]} ${inv.number}`);
  doc.setAuthor(b.name);
  doc.setSubject(inv.irn ? `NRS IRN ${inv.irn}` : "Invoice");
  const page = doc.addPage([595.28, 841.89]); // A4
  const reg = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.1, 0.12, 0.11), muted = rgb(0.38, 0.41, 0.39), rule = rgb(0.85, 0.87, 0.86), brand = hex(b.brandColor);
  const stamp = rgb(0.18, 0.26, 0.71);
  const M = 48, W = 595.28 - M * 2;
  let y = 841.89 - M;
  const text = (p: PDFPage, s: string, x: number, yy: number, o: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb>; right?: boolean } = {}) => {
    const size = o.size ?? 9.5, font = o.font ?? reg, t = ascii(s);
    p.drawText(t, { x: o.right ? x - font.widthOfTextAtSize(t, size) : x, y: yy, size, font, color: o.color ?? ink });
  };

  page.drawRectangle({ x: 0, y: 841.89 - 8, width: 595.28, height: 8, color: brand });

  // header
  let logoW = 0;
  if (b.logo.startsWith("data:image/png") || b.logo.startsWith("data:image/jpeg")) {
    try {
      const bytes = Buffer.from(b.logo.split(",")[1], "base64");
      const img = b.logo.startsWith("data:image/png") ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
      const s = img.scaleToFit(60, 60);
      page.drawImage(img, { x: M, y: y - s.height + 4, width: s.width, height: s.height });
      logoW = s.width + 12;
    } catch { /* skip an unreadable logo */ }
  }
  text(page, b.name, M + logoW, y - 8, { size: 15, font: bold, color: brand });
  const addr = [b.street, b.city, b.state].filter(Boolean).join(", ");
  text(page, addr, M + logoW, y - 24, { color: muted });
  text(page, `TIN ${b.tin || "-"}`, M + logoW, y - 36, { color: muted });
  text(page, [b.email, b.phone].filter(Boolean).join("   "), M + logoW, y - 48, { color: muted });
  text(page, KIND_LABEL[inv.kind].toUpperCase(), M + W, y - 12, { size: 22, font: bold, right: true });
  text(page, inv.number, M + W, y - 30, { size: 11, color: muted, right: true });
  y -= 84;

  // parties
  const col = W / 3;
  const block = (x: number, title: string, lines: string[]) => {
    text(page, title, x, y, { size: 8, font: bold, color: muted });
    lines.filter(Boolean).forEach((l, i) => text(page, l, x, y - 14 - i * 12, { font: i === 0 ? bold : reg }));
  };
  const c = inv.customer;
  block(M, "BILL TO", [c.name, [c.street, c.city].filter(Boolean).join(", "), c.tin ? `TIN ${c.tin}` : "", c.email]);
  block(M + col, "DATES", [`Issued ${fmtDate(inv.issueDate)}`, inv.dueDate ? `Due ${fmtDate(inv.dueDate)}` : "", inv.refIrn ? `Ref ${inv.refIrn}` : ""]);
  const means = PAYMENT_MEANS.find((m) => m[0] === inv.paymentMeans)?.[1] ?? "";
  block(M + col * 2, "PAYMENT", [means, ...b.bankDetails.split("\n").slice(0, 3)]);
  y -= 78;

  // lines
  const t = calcInvoice(inv.lines, b.vatRate);
  const cols = [{ k: "Item", x: M }, { k: "HS code", x: M + 200 }, { k: "Qty", x: M + 300, r: true }, { k: "Unit price", x: M + 380, r: true }, { k: "VAT", x: M + 420, r: true }, { k: "Amount", x: M + W, r: true }];
  cols.forEach((h) => text(page, h.k, h.x, y, { size: 8, font: bold, color: muted, right: h.r }));
  y -= 6;
  page.drawLine({ start: { x: M, y }, end: { x: M + W, y }, thickness: 1.2, color: ink });
  y -= 14;
  for (const l of t.lines) {
    const nameLines = wrap(l.name, reg, 9.5, 190);
    text(page, nameLines[0], M, y);
    text(page, l.hsCode, M + 200, y);
    text(page, `${toNum(l.quantity)} ${l.unit}`, M + 300, y, { right: true });
    text(page, ngn(l.price), M + 380, y, { right: true });
    text(page, `${l.pct}%`, M + 420, y, { right: true });
    text(page, ngn(l.ext), M + W, y, { right: true });
    let extra = 0;
    for (const nl of nameLines.slice(1)) { extra += 11; text(page, nl, M, y - extra); }
    if (l.discount) { extra += 11; text(page, `Less discount ${ngn(l.discount)}`, M, y - extra, { size: 8, color: muted }); }
    y -= 8 + extra;
    page.drawLine({ start: { x: M, y }, end: { x: M + W, y }, thickness: 0.5, color: rule });
    y -= 14;
    if (y < 260) break; // one page holds about 20 lines; longer invoices are rare for this business size
  }

  // totals
  y -= 6;
  const tx = M + W - 200;
  const row = (k: string, v: string, f = reg, size = 9.5) => { text(page, k, tx, y, { font: f, size, color: f === bold ? ink : muted }); text(page, v, M + W, y, { font: f, size, right: true }); y -= 15; };
  row("Subtotal", ngn(t.subtotal));
  for (const g of t.subtotals) row(`${TAX_CATEGORIES[g.id]} ${g.pct}%`, ngn(g.tax));
  page.drawLine({ start: { x: tx, y: y + 9 }, end: { x: M + W, y: y + 9 }, thickness: 1.2, color: ink });
  y -= 4;
  row("Total", ngn(t.total), bold, 13);
  if (toNum(inv.amountPaid) > 0) { row("Paid", ngn(inv.amountPaid)); row("Balance due", ngn(t.total - toNum(inv.amountPaid)), bold); }

  // NRS seal
  const signed = inv.nrsStatus === "signed" || inv.nrsStatus === "transmitted";
  const sealY = 96, sealH = 120, sealW = 330;
  page.drawRectangle({ x: M, y: sealY, width: sealW, height: sealH, borderColor: signed ? stamp : rgb(0.6, 0.64, 0.79), borderWidth: signed ? 2 : 1, borderDashArray: signed ? undefined : [4, 3] });
  if (signed && inv.nrsQr) {
    const png = await QRCode.toBuffer(inv.nrsQr, { errorCorrectionLevel: "M", margin: 0, width: 300 });
    const img = await doc.embedPng(png);
    page.drawImage(img, { x: M + 10, y: sealY + 10, width: 100, height: 100 });
  } else {
    text(page, "QR code appears", M + 22, sealY + 64, { size: 8, color: muted });
    text(page, "once NRS signs", M + 24, sealY + 52, { size: 8, color: muted });
  }
  const sx = M + 124;
  text(page, signed ? "NRS E-INVOICE" : "AWAITING NRS SIGNATURE", sx, sealY + 96, { size: 8.5, font: bold, color: stamp });
  wrap(inv.irn || "IRN assigned at validation", bold, 11, sealW - 134).forEach((l, i) => text(page, l, sx, sealY + 78 - i * 13, { size: 11, font: bold }));
  if (signed) {
    wrap(`CSID ${inv.nrsCsid}`, reg, 8, sealW - 134).slice(0, 3).forEach((l, i) => text(page, l, sx, sealY + 44 - i * 10, { size: 8, color: muted }));
    text(page, `Signed ${fmtDate(inv.nrsSignedAt)}`, sx, sealY + 12, { size: 8, color: muted });
  }
  if (inv.nrsSimulated) {
    page.drawRectangle({ x: M + sealW - 150, y: sealY + sealH - 8, width: 146, height: 16, color: rgb(0.69, 0.16, 0.12) });
    text(page, "SANDBOX - NOT VALID FOR TAX", M + sealW - 144, sealY + sealH - 3, { size: 7.5, font: bold, color: rgb(1, 1, 1) });
  }

  // footer
  const foot = [inv.note, b.terms].filter(Boolean).join("  ");
  wrap(foot, reg, 8.5, W).slice(0, 4).forEach((l, i) => text(page, l, M, 70 - i * 11, { size: 8.5, color: muted }));
  return doc.save();
}
