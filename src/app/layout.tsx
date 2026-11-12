import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import "@fontsource-variable/montserrat";
import "./globals.css";
import { APP_DESCRIPTION, APP_NAME } from "@/lib/brand";
import { CookieNotice } from "@/components/CookieNotice";

export const metadata: Metadata = {
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
  description: APP_DESCRIPTION,
  applicationName: APP_NAME,
  referrer: "strict-origin-when-cross-origin",
  robots: { index: true, follow: true },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#1B4332" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const jar = await cookies();
  const theme = jar.get("ft_theme")?.value;
  const seenNotice = jar.get("ft_notice")?.value === "1";
  return (
    <html lang="en-NG" className={theme === "dark" || theme === "light" ? theme : undefined}>
      <body>
        {children}
        {!seenNotice && <CookieNotice />}
      </body>
    </html>
  );
}
