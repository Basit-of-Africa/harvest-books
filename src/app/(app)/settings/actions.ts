"use server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireBusiness } from "@/lib/auth";
import { attempt, back, str } from "@/lib/flash";
import { toNum } from "@/lib/format";
import { audit } from "@/lib/security";
import { assertPublicHttpsUrl } from "@/lib/net";
import { decryptCredentials, encryptCredentials, PROVIDERS, type NrsCredentials } from "@/lib/nrs/providers";

const TEXT = ["name", "tin", "description", "email", "phone", "street", "city", "state", "postalCode", "nrsBusinessId", "nrsServiceId", "codeInvoice", "codeCredit", "codeDebit", "bankDetails", "terms"] as const;

export async function saveBusiness(fd: FormData) {
  const ctx = await requireBusiness("owner");
  const patch: Record<string, any> = {};
  for (const k of TEXT) if (fd.has(k)) patch[k] = str(fd, k).slice(0, k === "terms" || k === "bankDetails" || k === "description" ? 2000 : 200);
  if (fd.has("country")) patch.country = str(fd, "country").toUpperCase().slice(0, 2);
  for (const k of ["invPrefix", "crnPrefix", "dbnPrefix"]) if (fd.has(k)) patch[k] = str(fd, k).replace(/[^A-Za-z]/g, "").toUpperCase() || undefined;
  if (fd.has("vatRate")) { const v = toNum(str(fd, "vatRate")); if (v < 0 || v > 100) back("/settings", "err", "VAT rate must be between 0 and 100."); patch.vatRate = v; }
  if (fd.has("brandColor")) { const c = str(fd, "brandColor"); if (/^#[0-9a-f]{6}$/i.test(c)) patch.brandColor = c; }
  if (patch.name === "") back("/settings", "err", "The business name cannot be empty.");
  if (patch.nrsServiceId && !/^[A-Za-z0-9]{8}$/.test(patch.nrsServiceId)) back("/settings", "err", "The NRS Service ID must be exactly 8 letters or numbers.");
  if (patch.nrsBusinessId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(patch.nrsBusinessId)) back("/settings", "err", "The NRS Business ID must be the 36-character ID from your NRS profile.");
  if (patch.phone && !/^\+234\d{10}$/.test(patch.phone)) back("/settings", "err", "Use +234 format for the phone number, for example +2348012345678.");
  const logo = fd.get("logo");
  if (logo instanceof File && logo.size > 0) {
    if (logo.size > 150 * 1024) back("/settings", "err", "The logo must be under 150 KB. Use a smaller PNG or JPG.");
    if (!["image/png", "image/jpeg"].includes(logo.type)) back("/settings", "err", "Upload the logo as a PNG or JPG so it also prints on PDFs.");
    const bytes = Buffer.from(await logo.arrayBuffer());
    // Check the file really is what it says: the declared type comes from the browser and can't be trusted.
    const png = bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    const jpg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    if (!png && !jpg) back("/settings", "err", "That file isn't a valid PNG or JPG image.");
    patch.logo = `data:${png ? "image/png" : "image/jpeg"};base64,${bytes.toString("base64")}`;
  }
  if (fd.get("removeLogo") === "on") patch.logo = "";
  Object.keys(patch).forEach((k) => patch[k] === undefined && delete patch[k]);
  await db.update(schema.businesses).set(patch).where(eq(schema.businesses.id, ctx.business.id));
  await audit({ action: "business.updated", userId: ctx.user.id, businessId: ctx.business.id, meta: { fields: Object.keys(patch) } });
  revalidatePath("/", "layout");
  back("/settings", "ok", "Setup saved.");
}

export async function saveNrsConnection(fd: FormData) {
  const ctx = await requireBusiness("owner");
  const provider = str(fd, "provider");
  if (!PROVIDERS.some((p) => p.id === provider)) back("/settings#nrs", "err", "Choose a connection type.");
  const res = await attempt(async () => {
    const cur: NrsCredentials = ctx.business.nrsCredentials ? decryptCredentials(ctx.business.nrsCredentials) : {};
    const next: NrsCredentials = { ...cur, baseUrl: str(fd, "baseUrl") || cur.baseUrl };
    for (const k of ["apiKey", "apiSecret", "publicKey", "certificate"] as const) { const v = str(fd, k); if (v) next[k] = v; }
    const paths = str(fd, "paths");
    if (paths) { const p = JSON.parse(paths); if (typeof p !== "object" || Array.isArray(p) || !p) throw new Error("Endpoint paths must be a JSON object.");
      for (const v of Object.values(p)) if (typeof v !== "string" || !/^\/[A-Za-z0-9/_\-.{}]*$/.test(v)) throw new Error("Each endpoint path must start with / and contain only letters, numbers and / _ - . { }");
      next.paths = p; } else delete next.paths;
    if (provider !== "sandbox" && next.baseUrl) await assertPublicHttpsUrl(next.baseUrl);
    await db.update(schema.businesses).set({ nrsProvider: provider, nrsCredentials: provider === "sandbox" && !next.apiKey ? "" : encryptCredentials(next) }).where(eq(schema.businesses.id, ctx.business.id));
  });
  if (!res.ok) back("/settings#nrs", "err", res.error);
  await audit({ action: "nrs.credentials_saved", userId: ctx.user.id, businessId: ctx.business.id, meta: { provider } });
  revalidatePath("/", "layout");
  back("/settings", "ok", "NRS connection saved. Secrets are stored encrypted and are never shown again.");
}

export async function clearNrsSecrets() {
  const ctx = await requireBusiness("owner");
  await db.update(schema.businesses).set({ nrsCredentials: "", nrsProvider: "sandbox" }).where(eq(schema.businesses.id, ctx.business.id));
  await audit({ action: "nrs.credentials_cleared", userId: ctx.user.id, businessId: ctx.business.id });
  revalidatePath("/", "layout");
  back("/settings", "ok", "NRS credentials removed. The sandbox is active.");
}

export async function addAccount(fd: FormData) {
  const ctx = await requireBusiness("owner");
  const code = str(fd, "code"), name = str(fd, "name"), type = str(fd, "type");
  if (!/^\d{4}$/.test(code)) back("/settings#accounts", "err", "Account codes are four digits, for example 6150.");
  if (!name) back("/settings#accounts", "err", "Add the account name.");
  if (!["asset", "liability", "equity", "income", "expense"].includes(type)) back("/settings#accounts", "err", "Choose the account type.");
  const res = await attempt(() => db.insert(schema.accounts).values({ businessId: ctx.business.id, code, name, type: type as any }));
  if (!res.ok) back("/settings#accounts", "err", res.error.includes("duplicate") ? `Code ${code} is already used.` : res.error);
  back("/settings", "ok", `${code} ${name} added.`);
}
