import { test } from "node:test";
import assert from "node:assert/strict";
import { csvCell } from "../src/lib/csv";
import { isPrivateAddress, assertPublicHttpsUrl } from "../src/lib/net";
import { passwordProblem, publicMessage } from "../src/lib/security";
import { redact } from "../src/lib/nrs/providers";

test("CSV cells that look like formulas are neutralised", () => {
  assert.equal(csvCell("=HYPERLINK(\"http://x\")"), `"'=HYPERLINK(""http://x"")"`);
  assert.equal(csvCell("+2348012345678"), "'+2348012345678");
  assert.equal(csvCell("@SUM(A1)"), "'@SUM(A1)");
  assert.equal(csvCell("-1500"), "-1500");
  assert.equal(csvCell(-1500), "-1500");
  assert.equal(csvCell("Maize, 50kg"), `"Maize, 50kg"`);
  assert.equal(csvCell(null), "");
});

test("private and internal addresses are recognised", () => {
  for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "::ffff:10.0.0.1", "fe80::1"]) assert.equal(isPrivateAddress(ip), true, ip);
  for (const ip of ["41.58.1.1", "102.89.2.3", "8.8.8.8", "2001:4860:4860::8888"]) assert.equal(isPrivateAddress(ip), false, ip);
});

test("outbound NRS URLs must be public https", async () => {
  await assert.rejects(assertPublicHttpsUrl("http://example.com"), /https/);
  await assert.rejects(assertPublicHttpsUrl("https://localhost/api"), /public/);
  await assert.rejects(assertPublicHttpsUrl("https://169.254.169.254/latest"), /public/);
  await assert.rejects(assertPublicHttpsUrl("https://user:pw@example.com"), /username/);
  await assert.rejects(assertPublicHttpsUrl("not a url"), /valid/);
});

test("password policy favours length and blocks the obvious", () => {
  assert.match(passwordProblem("short")!, /12 characters/);
  assert.match(passwordProblem("passwordpassword")!, /common/);
  assert.match(passwordProblem("aaaaaaaaaaaaaa")!, /repeated/);
  assert.match(passwordProblem("adebayo-farms-2026", "adebayo@example.ng")!, /email/);
  assert.match(passwordProblem("x".repeat(30) + "é".repeat(30))!, /too long/);
  assert.equal(passwordProblem("maize grows tall in july", "ade@example.ng", "Ade Bello"), null);
});

test("database errors never reach the screen", () => {
  assert.equal(publicMessage({ message: "Failed query: select * from users where email = $1" }), "Something went wrong saving that. Please try again.");
  assert.equal(publicMessage({ message: "x", cause: { code: "23505" } }), "That record already exists (duplicate).");
  assert.equal(publicMessage({ message: "relation \"users\" does not exist", code: "42P01" }), "Something went wrong saving that. Please try again.");
  assert.equal(publicMessage(new Error("Enter money in or money out.")), "Enter money in or money out.");
});

test("secrets are redacted from the NRS call log", () => {
  const r = redact({ headers: { "x-api-key": "k", "x-api-secret": "s" }, body: { irn: "INV1", token: "t", password: "p" } });
  assert.deepEqual(r, { headers: { "x-api-key": "[redacted]", "x-api-secret": "[redacted]" }, body: { irn: "INV1", token: "[redacted]", password: "[redacted]" } });
});
