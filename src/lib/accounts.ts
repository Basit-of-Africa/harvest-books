import { and, eq } from "drizzle-orm";
import { schema, type DB, type Tx } from "@/db";

type AccountType = "asset" | "liability" | "equity" | "income" | "expense";

/** Default chart of accounts for a small Nigerian agribusiness. Codes marked system are used by posting rules. */
export const DEFAULT_CHART: [string, string, AccountType, boolean][] = [
  ["1000", "Cash at bank and in hand", "asset", true],
  ["1010", "Petty cash", "asset", true],
  ["1100", "Accounts receivable (debtors)", "asset", true],
  ["1300", "Input VAT recoverable", "asset", true],
  ["1500", "Equipment, machinery and vehicles", "asset", true],
  ["1510", "Accumulated depreciation", "asset", true],
  ["2000", "Accounts payable (creditors)", "liability", true],
  ["2100", "Output VAT payable", "liability", true],
  ["2200", "Loans", "liability", false],
  ["3000", "Owner's capital and opening balances", "equity", true],
  ["4000", "Sales revenue", "income", true],
  ["4100", "Other income", "income", false],
  ["4200", "Grants received", "income", false],
  ["5000", "Purchases and farm inputs", "expense", true],
  ["6000", "Wages and salaries", "expense", true],
  ["6100", "Transport and logistics", "expense", false],
  ["6200", "Repairs and maintenance", "expense", false],
  ["6300", "General expenses", "expense", true],
  ["6400", "Depreciation", "expense", true],
  ["6500", "Rent and utilities", "expense", false],
  ["6600", "Bank charges", "expense", false],
];

export const ACC = {
  cash: "1000", petty: "1010", receivable: "1100", inputVat: "1300", fixedAssets: "1500", accDep: "1510",
  payable: "2000", outputVat: "2100", equity: "3000", sales: "4000", otherIncome: "4100",
  purchases: "5000", wages: "6000", general: "6300", depreciation: "6400",
} as const;

export async function seedChart(tx: DB | Tx, businessId: string) {
  await tx.insert(schema.accounts)
    .values(DEFAULT_CHART.map(([code, name, type, system]) => ({ businessId, code, name, type, system })))
    .onConflictDoNothing();
}

/** Map of account code to id for one business. */
export async function accountIds(tx: DB | Tx, businessId: string): Promise<Record<string, string>> {
  const rows = await tx.select({ id: schema.accounts.id, code: schema.accounts.code })
    .from(schema.accounts).where(eq(schema.accounts.businessId, businessId));
  return Object.fromEntries(rows.map((r) => [r.code, r.id]));
}

export async function accountBelongs(tx: DB | Tx, businessId: string, accountId: string) {
  const [a] = await tx.select({ id: schema.accounts.id }).from(schema.accounts)
    .where(and(eq(schema.accounts.id, accountId), eq(schema.accounts.businessId, businessId))).limit(1);
  return !!a;
}
