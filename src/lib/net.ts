import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * Guards outbound calls to the NRS / Access Point Provider URL a business owner types in,
 * so the server can't be pointed at its own network, cloud metadata or other internal services (SSRF).
 */
export function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    if (v === "::" || v === "::1") return true;
    if (v.startsWith("::ffff:")) return isPrivateAddress(v.slice(7));
    return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(v) || v.startsWith("64:ff9b:") || v.startsWith("2001:db8");
  }
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = p;
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
}

/** Throws a plain-language error unless `raw` is an https URL whose host resolves only to public addresses. */
export async function assertPublicHttpsUrl(raw: string): Promise<URL> {
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error("The API base URL is not a valid web address."); }
  if (url.protocol !== "https:") throw new Error("The API base URL must start with https://");
  if (url.username || url.password) throw new Error("Don't put a username or password in the API base URL.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (/^(localhost|.*\.local|.*\.internal|.*\.localhost)$/i.test(host)) throw new Error("The API base URL must be a public internet address.");
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => { throw new Error(`Could not find ${host}. Check the API base URL.`); });
  if (!addrs.length || addrs.some((a) => isPrivateAddress(a.address))) throw new Error("The API base URL must be a public internet address.");
  return url;
}
