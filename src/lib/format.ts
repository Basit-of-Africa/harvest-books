export const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function toNum(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = parseFloat(String(v ?? "").replace(/[₦,\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/** ₦12,500.00 — negative values use a true minus sign. */
export function money(n: number | null | undefined, symbol = "₦"): string {
  const v = toNum(n);
  const s = Math.abs(v).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (v < 0 ? "−" : "") + symbol + s;
}

export function qty(n: number | null | undefined): string {
  return toNum(n).toLocaleString("en-NG", { maximumFractionDigits: 3 });
}

export function compactMoney(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e6) return "₦" + (n / 1e6).toFixed(a >= 1e7 ? 0 : 1) + "m";
  if (a >= 1e3) return "₦" + Math.round(n / 1e3) + "k";
  return "₦" + Math.round(n);
}

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n: number) => String(n).padStart(2, "0");

/** Calendar date in Lagos time as YYYY-MM-DD. */
export function todayISO(): string {
  const d = new Date(Date.now() + 60 * 60 * 1000); // WAT is UTC+1 all year
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
export function nowTimeWAT(): string {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}
export function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function fmtDate(s: string | Date | null | undefined): string {
  if (!s) return "";
  const v = typeof s === "string" ? s : new Date(s.getTime() + 60 * 60 * 1000).toISOString(); // timestamps shown in Lagos time
  const [y, m, d] = v.slice(0, 10).split("-");
  return `${+d} ${MONTHS[+m - 1] ?? ""} ${y}`;
}
export function isISODate(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
}
