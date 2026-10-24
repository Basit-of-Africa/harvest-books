import { redirect } from "next/navigation";

/** Redirect back with a one-line message the page shows at the top. */
export function back(path: string, kind: "ok" | "err", message: string, extra: Record<string, string> = {}): never {
  const [base, q = ""] = path.split("?");
  const p = new URLSearchParams(q);
  p.delete("ok"); p.delete("err");
  p.set(kind, message);
  for (const [k, v] of Object.entries(extra)) p.set(k, v);
  redirect(`${base}?${p.toString()}`);
}

export const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

/** Run an action body; turn thrown errors into a flash message. Redirects inside `fn` pass through. */
export async function attempt<T>(fn: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: string }> {
  try { return { ok: true, value: await fn() }; }
  catch (e: any) {
    if (e?.digest?.startsWith?.("NEXT_REDIRECT") || e?.message === "NEXT_REDIRECT") throw e;
    console.error(e);
    return { ok: false, error: e?.message ? String(e.message) : "Something went wrong. Try again." };
  }
}
