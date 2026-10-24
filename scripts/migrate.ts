import { migrate } from "drizzle-orm/node-postgres/migrator";
import { getDb } from "../src/db";

async function main() {
  await migrate(getDb(), { migrationsFolder: "drizzle" });
  console.log("Database is up to date.");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
