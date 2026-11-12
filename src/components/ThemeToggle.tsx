"use client";
import { Moon, Sun } from "lucide-react";

/** Switches light and dark. The choice is kept in a first-party preference cookie (no tracking). */
export function ThemeToggle({ className = "iconbtn" }: { className?: string }) {
  function toggle() {
    const root = document.documentElement;
    const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const dark = root.classList.contains("dark") || (!root.classList.contains("light") && systemDark);
    const next = dark ? "light" : "dark";
    root.classList.remove("light", "dark");
    root.classList.add(next);
    document.cookie = `ft_theme=${next}; path=/; max-age=31536000; samesite=lax${location.protocol === "https:" ? "; secure" : ""}`;
  }
  return (
    <button type="button" className={className} onClick={toggle} title="Switch light and dark theme" aria-label="Switch light and dark theme">
      <Moon className="ic-moon" /><Sun className="ic-sun" />
    </button>
  );
}
