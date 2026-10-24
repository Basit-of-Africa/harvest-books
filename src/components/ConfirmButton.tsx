"use client";
import { useEffect, useState } from "react";

/** A submit button that asks for a second click before it submits. */
export function ConfirmButton({ children, confirmLabel = "Confirm delete", className = "ghost danger" }: { children: React.ReactNode; confirmLabel?: string; className?: string }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => { if (!armed) return; const t = setTimeout(() => setArmed(false), 4000); return () => clearTimeout(t); }, [armed]);
  return (
    <button type={armed ? "submit" : "button"} className={`${className}${armed ? " armed" : ""}`} onClick={(e) => { if (!armed) { e.preventDefault(); setArmed(true); } }}>
      {armed ? confirmLabel : children}
    </button>
  );
}
