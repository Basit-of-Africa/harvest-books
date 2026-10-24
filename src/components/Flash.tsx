export function Flash({ ok, err, errors }: { ok?: string; err?: string; errors?: string[] }) {
  if (!ok && !err) return null;
  return (
    <div className={`flash ${err ? "err" : "ok"}`} role={err ? "alert" : "status"}>
      {err ?? ok}
      {errors && errors.length > 0 && <ul>{errors.map((e, i) => <li key={i}>{e}</li>)}</ul>}
    </div>
  );
}
