import "server-only";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";

export async function editorLists(businessId: string) {
  const [customers, items] = await Promise.all([
    db.select().from(schema.customers).where(eq(schema.customers.businessId, businessId)).orderBy(asc(schema.customers.name)),
    db.select().from(schema.items).where(eq(schema.items.businessId, businessId)).orderBy(asc(schema.items.name)),
  ]);
  return {
    customers: customers.map((c) => ({ name: c.name, tin: c.tin, email: c.email, phone: c.phone, street: c.street, city: c.city, postalCode: c.postalCode, country: c.country })),
    items: items.map((i) => ({ name: i.name, description: i.description, hsCode: i.hsCode, category: i.category, unit: i.unit, price: i.price, taxCategory: i.taxCategory })),
  };
}
