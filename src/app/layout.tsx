import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Harvest Books", template: "%s · Harvest Books" },
  description: "Bookkeeping and NRS e-invoicing for Nigerian agribusinesses.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

const FONTS = "https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@75..100,400..800&family=Public+Sans:ital,wght@0,400;0,500;0,600;1,400&display=swap";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-NG">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link rel="stylesheet" href={FONTS} />
      </head>
      <body>{children}</body>
    </html>
  );
}
