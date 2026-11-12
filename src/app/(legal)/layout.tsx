import Link from "next/link";
import { Brand } from "@/components/Brand";

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="legal-top">
        <Brand href="/" />
        <nav aria-label="Legal"><Link href="/privacy">Privacy</Link><Link href="/privacy#cookies">Cookies</Link><Link href="/terms">Terms</Link><Link href="/login">Sign in</Link></nav>
      </header>
      <main className="legal" id="main">{children}</main>
    </>
  );
}
