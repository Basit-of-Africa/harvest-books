"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Banknote, BookOpen, Boxes, Building2, FileText, HandCoins, LayoutDashboard, LogOut, Menu, Plus, Receipt,
  Scale, Settings, ShieldCheck, ShoppingCart, Sprout, Tractor, UserCog, Users, Wallet, X,
} from "lucide-react";
import { NavLink } from "./NavLink";
import { ThemeToggle } from "./ThemeToggle";

type Role = "owner" | "accountant" | "viewer";
const ROLE_LABEL: Record<Role, string> = { owner: "Owner", accountant: "Accountant", viewer: "Viewer" };

export type ShellProps = {
  appName: string;
  tagline: string;
  user: { name: string; email: string };
  role: Role;
  business: { id: string; name: string };
  memberships: { businessId: string; name: string }[];
  unsigned: number;
  signOut: () => Promise<void>;
  switchBusiness: (fd: FormData) => Promise<void>;
  children: React.ReactNode;
};

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("") || "?";

export function AppShell({ appName, tagline, user, role, business, memberships, unsigned, signOut, switchBusiness, children }: ShellProps) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  const close = () => setOpen(false);
  const first = user.name.split(/\s+/)[0] || user.name;

  return (
    <div className="shell">
      <a className="skip" href="#main">Skip to content</a>
      <aside id="sidebar" className={`sidebar${open ? " open" : ""}`} aria-label="Main navigation">
        <button type="button" className="close" onClick={close} aria-label="Close menu"><X /></button>
        <Link href="/dashboard" className="brand" onClick={close}>
          <span className="logo" aria-hidden="true"><Sprout /></span>
          <span><b>{appName}</b><small>{tagline}</small></span>
        </Link>

        <div className="usercard">
          <span className="avatar" aria-hidden="true">{initials(user.name)}</span>
          <div style={{ minWidth: 0 }}>
            <div className="nm">{user.name}</div>
            <div className="biz">{business.name}</div>
            <span className={`role ${role}`}>{ROLE_LABEL[role]}</span>
          </div>
        </div>

        <nav className="navgroup" aria-label="Overview">
          <NavLink href="/dashboard" icon={<LayoutDashboard />} onNavigate={close}>Monthly summary</NavLink>
          <NavLink href="/invoices" icon={<Receipt />} badge={unsigned} onNavigate={close}>E-invoices</NavLink>
        </nav>
        <nav className="navgroup" aria-label="Books">
          <h4>Books</h4>
          <NavLink href="/books/cash" icon={<Wallet />} onNavigate={close}>Cash book</NavLink>
          <NavLink href="/books/sales" icon={<HandCoins />} onNavigate={close}>Sales book</NavLink>
          <NavLink href="/books/purchases" icon={<ShoppingCart />} onNavigate={close}>Purchases book</NavLink>
          <NavLink href="/books/petty" icon={<Banknote />} onNavigate={close}>Petty cash</NavLink>
          <NavLink href="/books/inventory" icon={<Boxes />} onNavigate={close}>Inventory</NavLink>
          <NavLink href="/books/payroll" icon={<Users />} onNavigate={close}>Payroll</NavLink>
          <NavLink href="/books/assets" icon={<Tractor />} onNavigate={close}>Asset register</NavLink>
          <NavLink href="/books/parties" icon={<BookOpen />} onNavigate={close}>Debtors and creditors</NavLink>
        </nav>
        <nav className="navgroup" aria-label="Accounts and setup">
          <h4>Accounts and setup</h4>
          <NavLink href="/accounts" icon={<Scale />} onNavigate={close}>Trial balance</NavLink>
          <NavLink href="/settings" icon={<Settings />} onNavigate={close}>Business and NRS setup</NavLink>
          <NavLink href="/team" icon={<UserCog />} onNavigate={close}>Team</NavLink>
          <NavLink href="/account" icon={<ShieldCheck />} onNavigate={close}>Privacy and security</NavLink>
        </nav>

        <div className="side-foot">
          {memberships.length > 1 && (
            <form action={switchBusiness} className="row" style={{ alignItems: "flex-end" }}>
              <label className="f" htmlFor="biz" style={{ flex: 1 }}>Business
                <select id="biz" name="businessId" defaultValue={business.id}>
                  {memberships.map((m) => <option key={m.businessId} value={m.businessId}>{m.name}</option>)}
                </select>
              </label>
              <button type="submit" className="side-btn" style={{ width: "auto" }}><Building2 />Switch</button>
            </form>
          )}
          <Link className="side-btn gold" href="/onboarding" onClick={close}><Plus />Add a business</Link>
          <form action={signOut}><button type="submit" className="side-btn out"><LogOut />Sign out</button></form>
        </div>
      </aside>
      <div className={`backdrop${open ? " open" : ""}`} onClick={close} aria-hidden="true" />

      <div className="workspace">
        <header className="topbar-m">
          <div className="l">
            <button type="button" className="menu" onClick={() => setOpen(!open)} aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} aria-controls="sidebar">
              {open ? <X /> : <Menu />}
            </button>
            <span className="nm"><Sprout />{appName}</span>
          </div>
          <div className="r">
            <ThemeToggle />
            <span className="pillrole">{ROLE_LABEL[role]}</span>
          </div>
        </header>
        <main id="main">
          <div className="welcome">
            <div>
              <span className="eyebrow">Secure session · {business.name}</span>
              <h2>Welcome back, {first}</h2>
            </div>
            <div className="who-r">
              <div>
                <div className="em">{user.email}</div>
                <div className="live"><span className="pulse" />{ROLE_LABEL[role]} access</div>
              </div>
              <span className="vr" />
              <Link className="btn iconbtn" href="/invoices/new" title="New e-invoice" aria-label="New e-invoice"><FileText /></Link>
              <ThemeToggle />
            </div>
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}
