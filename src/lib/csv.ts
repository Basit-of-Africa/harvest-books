/**
 * One CSV cell. Text starting with = + - @ or a tab/return is prefixed with ' so spreadsheet apps
 * treat it as text, not a formula (CSV/formula injection). Plain numbers are left alone.
 */
export function csvCell(v: unknown): string {
  let s = v == null ? "" : String(v);
  if (typeof v !== "number" && /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
