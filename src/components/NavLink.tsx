"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLink({ href, children, badge, icon, onNavigate }: { href: string; children: React.ReactNode; badge?: number; icon?: React.ReactNode; onNavigate?: () => void }) {
  const path = usePathname();
  const active = path === href || path.startsWith(href + "/");
  return (
    <Link href={href} className="nav" aria-current={active ? "page" : undefined} onClick={onNavigate}>
      {icon}
      <span className="lbl">{children}</span>
      {badge ? <span className="badge" title={`${badge} not yet signed by NRS`}>{badge}</span> : null}
    </Link>
  );
}
