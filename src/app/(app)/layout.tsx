import { and, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireBusiness } from "@/lib/auth";
import { redirect } from "next/navigation";
import { APP_NAME, APP_TAGLINE, POLICY_VERSION } from "@/lib/brand";
import { AppShell } from "@/components/AppShell";
import { signOut, switchBusiness } from "../(auth)/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireBusiness();
  if (ctx.user.termsVersion !== POLICY_VERSION) redirect("/consent");
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.invoices)
    .where(and(eq(schema.invoices.businessId, ctx.business.id), inArray(schema.invoices.nrsStatus, ["draft", "validated", "failed"])));
  return (
    <AppShell
      appName={APP_NAME}
      tagline={APP_TAGLINE}
      user={{ name: ctx.user.name, email: ctx.user.email }}
      role={ctx.role}
      business={{ id: ctx.business.id, name: ctx.business.name }}
      memberships={ctx.memberships.map((m) => ({ businessId: m.businessId, name: m.name }))}
      unsigned={n}
      signOut={signOut}
      switchBusiness={switchBusiness}
    >
      {children}
    </AppShell>
  );
}
