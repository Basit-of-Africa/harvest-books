import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export type DB = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];

const g = globalThis as unknown as { __hbPool?: Pool; __hbDb?: DB };

function makePool() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local and add your Neon connection string.");
  const local = /localhost|127\.0\.0\.1/.test(url);
  return new Pool({ connectionString: url, max: 5, ssl: local ? undefined : { rejectUnauthorized: true } });
}

export function getDb(): DB {
  if (!g.__hbDb) {
    g.__hbPool = makePool();
    g.__hbDb = drizzle(g.__hbPool, { schema });
  }
  return g.__hbDb;
}

export const db = new Proxy({} as DB, { get: (_t, p) => Reflect.get(getDb() as object, p) });
export { schema };
