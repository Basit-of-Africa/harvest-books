import "server-only";
import { constants, createCipheriv, createDecipheriv, publicEncrypt, randomBytes } from "node:crypto";
import type { NrsPayload } from "./core";

/**
 * Pluggable NRS connection. Each business picks a provider in setup; credentials are stored encrypted.
 * - sandbox: built-in simulator for testing the flow. Never valid for tax.
 * - nrs_mbs: direct connection to the NRS Merchant Buyer Solution API with x-api-key / x-api-secret.
 * - app_http: a generic Access Point Provider that accepts the NRS payload as-is (configure URLs per action).
 * To add an APP with its own API shape (Interswitch, DigiTax and others), implement NrsProvider and register it below.
 */
export type CallResult<T = unknown> = { ok: boolean; status?: number; data?: T; errors?: string[]; request?: unknown; response?: unknown };
export type SignResult = { csid: string; qr: string; signedAt: string; simulated?: boolean };

export interface NrsProvider {
  id: string; label: string;
  validateIrn(irn: string, invoiceNumber: string, businessId: string): Promise<CallResult>;
  validateInvoice(payload: NrsPayload): Promise<CallResult>;
  signInvoice(payload: NrsPayload): Promise<CallResult<SignResult>>;
  transmit(irn: string): Promise<CallResult>;
  updatePayment(irn: string, status: string, reference: string): Promise<CallResult>;
}

export type NrsCredentials = {
  baseUrl?: string; apiKey?: string; apiSecret?: string; publicKey?: string; certificate?: string;
  /** Optional path overrides, e.g. {"sign": "/api/v1/invoice/sign"} */
  paths?: Record<string, string>;
};

export const PROVIDERS: { id: string; label: string; description: string }[] = [
  { id: "sandbox", label: "Built-in sandbox", description: "Simulates NRS responses so you can test the whole flow. Signed invoices are marked as simulated and are not valid for tax." },
  { id: "nrs_mbs", label: "NRS Merchant Buyer Solution (direct)", description: "Connects to the NRS e-invoicing API with the API key and secret from your NRS profile." },
  { id: "app_http", label: "Access Point Provider (generic)", description: "Sends the NRS payload to your APP's endpoints. Use when your APP accepts the standard payload." },
];

/* ---------- credential encryption (AES-256-GCM) ---------- */
function key() {
  const k = process.env.ENCRYPTION_KEY;
  if (!k) throw new Error("ENCRYPTION_KEY is not set. Generate one with: openssl rand -base64 32");
  const b = Buffer.from(k, "base64");
  if (b.length !== 32) throw new Error("ENCRYPTION_KEY must be 32 bytes, base64-encoded.");
  return b;
}
export function encryptCredentials(c: NrsCredentials): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(JSON.stringify(c), "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), enc].map((b) => b.toString("base64")).join(".");
}
export function decryptCredentials(s: string): NrsCredentials {
  if (!s) return {};
  const [iv, tag, enc] = s.split(".").map((p) => Buffer.from(p, "base64"));
  const d = createDecipheriv("aes-256-gcm", key(), iv);
  d.setAuthTag(tag);
  return JSON.parse(Buffer.concat([d.update(enc), d.final()]).toString("utf8"));
}

/* ---------- sandbox ---------- */
const sandbox: NrsProvider = {
  id: "sandbox", label: "Built-in sandbox",
  async validateIrn(irn) { return { ok: true, data: { irn, valid: true }, request: { irn }, response: { code: 200, message: "IRN format accepted (sandbox)" } }; },
  async validateInvoice(p) { return { ok: true, request: p, response: { code: 200, message: "Invoice accepted (sandbox)" } }; },
  async signInvoice(p) {
    const signedAt = new Date().toISOString();
    const csid = "SANDBOX-" + randomBytes(6).toString("hex").toUpperCase();
    const qr = Buffer.from(JSON.stringify({ irn: p.irn, certificate: "SANDBOX-NOT-VALID-FOR-TAX", issued: signedAt })).toString("base64");
    return { ok: true, data: { csid, qr, signedAt, simulated: true }, request: { irn: p.irn }, response: { code: 201, csid } };
  },
  async transmit(irn) { return { ok: true, request: { irn }, response: { code: 200, message: "Transmitted (sandbox)" } }; },
  async updatePayment(irn, status) { return { ok: true, request: { irn, status }, response: { code: 200 } }; },
};

/* ---------- HTTP providers ---------- */
const MBS_PATHS: Record<string, string> = {
  validateIrn: "/api/v1/invoice/irn/validate",
  validate: "/api/v1/invoice/validate",
  sign: "/api/v1/invoice/sign",
  transmit: "/api/v1/invoice/transmit/{irn}",
  updatePayment: "/api/v1/invoice/update/{irn}",
};

async function http(c: NrsCredentials, method: string, pathKey: string, body: unknown, irn = ""): Promise<CallResult<any>> {
  if (!c.baseUrl) return { ok: false, errors: ["Add the API base URL in NRS connection settings."] };
  if (!c.apiKey || !c.apiSecret) return { ok: false, errors: ["Add the API key and secret in NRS connection settings."] };
  const path = (c.paths?.[pathKey] ?? MBS_PATHS[pathKey]).replace("{irn}", encodeURIComponent(irn));
  const url = c.baseUrl.replace(/\/$/, "") + path;
  try {
    const res = await fetch(url, {
      method,
      headers: { "content-type": "application/json", accept: "application/json", "x-api-key": c.apiKey, "x-api-secret": c.apiSecret },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    const text = await res.text();
    let data: any = text;
    try { data = JSON.parse(text); } catch { /* keep text */ }
    const errors = res.ok ? undefined : extractErrors(data, res.status);
    return { ok: res.ok, status: res.status, data, errors, request: { method, url, body }, response: data };
  } catch (err) {
    return { ok: false, errors: [`Could not reach the NRS service: ${(err as Error).message}`], request: { method, url, body } };
  }
}

function extractErrors(data: any, status: number): string[] {
  const out: string[] = [];
  const walk = (v: any) => {
    if (!v) return;
    if (typeof v === "string") out.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (typeof v === "object") { for (const k of ["message", "error", "details", "errors", "public_message"]) if (k in v) walk(v[k]); }
  };
  walk(data);
  return out.length ? [...new Set(out)].slice(0, 10) : [`NRS returned HTTP ${status}.`];
}

/**
 * NRS QR code data: the IRN with a Unix timestamp, plus the certificate from your crypto keys,
 * encrypted with the NRS public key (RSA) and base64-encoded.
 */
export function buildQrData(irn: string, publicKeyB64: string, certificate: string): string {
  const pem = Buffer.from(publicKeyB64, "base64").toString("utf8");
  const msg = JSON.stringify({ irn: `${irn}.${Math.floor(Date.now() / 1000)}`, certificate });
  return publicEncrypt({ key: pem.includes("BEGIN") ? pem : publicKeyB64, padding: constants.RSA_PKCS1_PADDING }, Buffer.from(msg)).toString("base64");
}

function httpProvider(id: string, label: string, c: NrsCredentials): NrsProvider {
  return {
    id, label,
    validateIrn: (irn, invoiceNumber, businessId) => http(c, "POST", "validateIrn", { invoice_reference: invoiceNumber, business_id: businessId, irn }),
    validateInvoice: (p) => http(c, "POST", "validate", p),
    async signInvoice(p) {
      const r = await http(c, "POST", "sign", p);
      if (!r.ok) return r;
      const d = r.data?.data ?? r.data ?? {};
      let qr: string = d.qr_code ?? d.qrCode ?? d.QRCodeData ?? "";
      if (!qr && c.publicKey && c.certificate) {
        try { qr = buildQrData(p.irn, c.publicKey, c.certificate); }
        catch (err) { return { ...r, ok: false, errors: [`Signed, but the QR code could not be built from your crypto keys: ${(err as Error).message}`] }; }
      }
      const csid = d.csid ?? d.CSID ?? d.cryptographic_stamp ?? d.irn ?? "";
      return { ...r, data: { csid: String(csid), qr, signedAt: new Date().toISOString() } };
    },
    transmit: (irn) => http(c, "POST", "transmit", undefined, irn),
    updatePayment: (irn, status, reference) => http(c, "PATCH", "updatePayment", { payment_status: status, reference }, irn),
  };
}

export function getProvider(providerId: string, encrypted: string): NrsProvider {
  if (providerId === "nrs_mbs" || providerId === "app_http") {
    const label = PROVIDERS.find((p) => p.id === providerId)!.label;
    return httpProvider(providerId, label, decryptCredentials(encrypted));
  }
  return sandbox;
}

/** Remove secrets before anything is written to the call log. */
export function redact<T>(v: T): T {
  return JSON.parse(JSON.stringify(v ?? null, (k, val) => (/secret|api[-_]?key|password|token/i.test(k) ? "[redacted]" : val)));
}
