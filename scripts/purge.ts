import { purgeExpired } from "../src/lib/privacy";

/** Removes data past its retention period. Same as the daily cron route. */
purgeExpired()
  .then((r) => { console.log("Removed:", r); process.exit(0); })
  .catch((e) => { console.error(e); process.exit(1); });
