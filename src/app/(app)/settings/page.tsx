import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { can, requireBusiness } from "@/lib/auth";
import { decryptCredentials, PROVIDERS } from "@/lib/nrs/providers";
import { Flash } from "@/components/Flash";
import { SubmitButton } from "@/components/SubmitButton";
import { ConfirmButton } from "@/components/ConfirmButton";
import { addAccount, clearNrsSecrets, saveBusiness, saveNrsConnection } from "./actions";

export const metadata = { title: "Business and NRS setup" };

export default async function Settings({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await requireBusiness();
  const sp = await searchParams;
  const b = ctx.business;
  const owner = can(ctx.role, "owner");
  let creds: ReturnType<typeof decryptCredentials> = {};
  let credError = "";
  try { creds = b.nrsCredentials ? decryptCredentials(b.nrsCredentials) : {}; } catch (e) { credError = (e as Error).message; }
  const accounts = await db.select().from(schema.accounts).where(eq(schema.accounts.businessId, b.id)).orderBy(asc(schema.accounts.code));
  const F = ({ k, label, hint, type = "text", ...rest }: { k: keyof typeof b; label: string; hint?: string; type?: string; [x: string]: any }) => (
    <label className="f" htmlFor={`s-${String(k)}`}>{label}<input id={`s-${String(k)}`} name={String(k)} type={type} defaultValue={String(b[k] ?? "")} disabled={!owner} {...rest} />{hint && <span className="hint">{hint}</span>}</label>
  );
  return (
    <div className="wrap">
      <div className="head"><div className="titles"><h1>Business and NRS setup</h1>
        <p className="lede">These details appear on every invoice and in every NRS payload. Your Business ID and Service ID come from your NRS e-invoicing profile or your Access Point Provider.</p></div></div>
      <Flash ok={sp.ok} err={sp.err} />
      {!owner && <p className="note">Only the owner can change setup. You can view it.</p>}

      <form action={saveBusiness} className="wrap" style={{ gap: 22 }}>
        <section className="panel"><div className="panel-h"><h2>Supplier details</h2></div><div className="grid g3">
          <F k="name" label="Registered business name" required />
          <F k="tin" label="Tax Identification Number (TIN)" />
          <F k="description" label="Business description" hint="Optional, e.g. Maize and soybean production" />
          <F k="email" label="Business email" type="email" />
          <F k="phone" label="Business phone" type="tel" placeholder="+2348012345678" hint="Use +234 format" />
          <F k="street" label="Street address" />
          <F k="city" label="City" /><F k="state" label="State" /><F k="postalCode" label="Postal code" />
          <F k="country" label="Country code" maxLength={2} hint="NG for Nigeria" />
        </div></section>

        <section className="panel"><div className="panel-h"><h2>NRS e-invoicing profile</h2></div><div className="grid g3">
          <F k="nrsBusinessId" label="NRS Business ID" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" hint="36-character ID" autoComplete="off" />
          <F k="nrsServiceId" label="NRS Service ID" maxLength={8} hint="8 characters; part of every IRN" autoComplete="off" />
          <F k="vatRate" label="Standard VAT rate (%)" type="number" step="0.01" />
          <F k="invPrefix" label="Invoice number prefix" hint="Letters only, e.g. INV" />
          <F k="crnPrefix" label="Credit note prefix" /><F k="dbnPrefix" label="Debit note prefix" />
          <F k="codeInvoice" label="Invoice type code" /><F k="codeCredit" label="Credit note type code" /><F k="codeDebit" label="Debit note type code" />
        </div>
          <p className="note warn" style={{ marginTop: 14 }}>Published guides disagree on invoice type codes. These defaults follow the UBL standard (380 invoice, 381 credit note, 384 debit note). Confirm them against the invoice types list from NRS or your APP and change them here if they differ.</p>
        </section>

        <section className="panel"><div className="panel-h"><h2>Invoice look</h2></div><div className="grid g3">
          <div className="f">Logo
            <div className="row"><div className="logo-prev">{b.logo ? <img src={b.logo} alt="Current logo" /> : <span className="hint">None</span>}</div>
              {owner && <input type="file" name="logo" accept="image/png,image/jpeg" style={{ width: "auto" }} />}</div>
            <span className="hint">PNG or JPG under 150 KB</span>
            {b.logo && owner && <label className="check"><input type="checkbox" name="removeLogo" />Remove logo</label>}
          </div>
          <label className="f" htmlFor="s-brand">Brand colour<input id="s-brand" name="brandColor" type="color" defaultValue={b.brandColor} disabled={!owner} style={{ width: 64, height: 40, padding: 2 }} /><span className="hint">Top band and business name</span></label>
          <div />
          <label className="f span2" htmlFor="s-bank">Bank details for payment<textarea id="s-bank" name="bankDetails" rows={3} defaultValue={b.bankDetails} disabled={!owner} placeholder={"Bank name\nAccount name\nAccount number"} /></label>
          <label className="f" htmlFor="s-terms">Standard terms<textarea id="s-terms" name="terms" rows={3} defaultValue={b.terms} disabled={!owner} /></label>
        </div></section>
        {owner && <div className="row end"><SubmitButton pendingLabel="Saving…">Save setup</SubmitButton></div>}
      </form>

      <section className="panel" id="nrs">
        <div className="panel-h"><h2>NRS connection</h2><span className={`chip dot ${b.nrsProvider === "sandbox" ? "warn" : "ok"}`}>{PROVIDERS.find((p) => p.id === b.nrsProvider)?.label}</span></div>
        {credError && <p className="flash err">Saved credentials cannot be read: {credError}</p>}
        <form action={saveNrsConnection} className="grid">
          <div className="grid g3">{PROVIDERS.map((p) => (
            <label key={p.id} className="panel" style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: owner ? "pointer" : "default" }}>
              <input type="radio" name="provider" value={p.id} defaultChecked={b.nrsProvider === p.id} disabled={!owner} style={{ width: "auto", marginTop: 3 }} />
              <span><b>{p.label}</b><br /><span className="small muted">{p.description}</span></span>
            </label>))}</div>
          <div className="grid g2">
            <label className="f" htmlFor="baseUrl">API base URL<input id="baseUrl" name="baseUrl" defaultValue={creds.baseUrl ?? ""} placeholder="https://" disabled={!owner} /><span className="hint">From your NRS profile or APP</span></label>
            <label className="f" htmlFor="apiKey">API key<input id="apiKey" name="apiKey" type="password" autoComplete="off" placeholder={creds.apiKey ? "Saved; type to replace" : ""} disabled={!owner} /></label>
            <label className="f" htmlFor="apiSecret">API secret<input id="apiSecret" name="apiSecret" type="password" autoComplete="off" placeholder={creds.apiSecret ? "Saved; type to replace" : ""} disabled={!owner} /></label>
            <label className="f" htmlFor="certificate">Certificate<input id="certificate" name="certificate" type="password" autoComplete="off" placeholder={creds.certificate ? "Saved; type to replace" : "From your crypto keys file"} disabled={!owner} /></label>
            <label className="f span2" htmlFor="publicKey">NRS public key<textarea id="publicKey" name="publicKey" rows={2} placeholder={creds.publicKey ? "Saved; paste to replace" : "Base64 public key from your crypto keys file; used to build the QR code"} disabled={!owner} /></label>
            <label className="f span2" htmlFor="paths">Endpoint paths (optional)<textarea id="paths" name="paths" rows={3} defaultValue={creds.paths ? JSON.stringify(creds.paths, null, 1) : ""} disabled={!owner}
              placeholder={'{"validateIrn": "/api/v1/invoice/irn/validate", "validate": "/api/v1/invoice/validate", "sign": "/api/v1/invoice/sign", "transmit": "/api/v1/invoice/transmit/{irn}", "updatePayment": "/api/v1/invoice/update/{irn}"}'} />
              <span className="hint">Override only if your NRS documentation or APP uses different paths. The defaults are shown as placeholder text.</span></label>
          </div>
          {owner && <div className="row end">
            <SubmitButton pendingLabel="Saving…">Save connection</SubmitButton></div>}
        </form>
        {owner && b.nrsCredentials && <form action={clearNrsSecrets} className="row end" style={{ marginTop: 8 }}><ConfirmButton confirmLabel="Confirm remove">Remove saved credentials</ConfirmButton></form>}
      </section>

      <section className="panel" id="accounts">
        <div className="panel-h"><h2>Chart of accounts</h2><span className="hint">Accounts marked system are used by the posting rules</span></div>
        <div className="tbl"><table><thead><tr><th>Code</th><th>Name</th><th>Type</th><th /></tr></thead>
          <tbody>{accounts.map((a) => <tr key={a.id}><td className="d">{a.code}</td><td>{a.name}</td><td>{a.type}</td><td>{a.system && <span className="chip">System</span>}</td></tr>)}</tbody></table></div>
        {owner && <form action={addAccount} className="row" style={{ marginTop: 14, alignItems: "flex-end" }}>
          <label className="f" htmlFor="a-code" style={{ width: 110 }}>Code<input id="a-code" name="code" inputMode="numeric" maxLength={4} required /></label>
          <label className="f" htmlFor="a-name" style={{ flex: "1 1 200px" }}>Name<input id="a-name" name="name" required /></label>
          <label className="f" htmlFor="a-type" style={{ width: 160 }}>Type<select id="a-type" name="type">{["asset", "liability", "equity", "income", "expense"].map((t) => <option key={t}>{t}</option>)}</select></label>
          <SubmitButton className="">Add account</SubmitButton>
        </form>}
      </section>
    </div>
  );
}
