// §9 test 13 — report tamper: write a copy of a published report with one payout changed, then
// open /report/<id>?src=/test-fixtures/<copy> in the client; the page must show "Mismatch"
// (and the untouched report "Verified ✓"). This script makes the fixture and checks the hashes
// offline with the same canonical rule the page uses.
//   tsx tests/devnet/test13-report-tamper.ts <raid_id>
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { REPO } from "../../scripts/spike-lib.ts";
import { reportHash } from "../../keeper/src/report.ts";

const id = process.argv[2];
const file = JSON.parse(readFileSync(join(REPO, "app", "public", "reports", `${id}.json`), "utf8"));
assert.equal(reportHash(file.report), file.hash, "published report hash recomputes");
const t = structuredClone(file);
t.report.raiders[0].dusdPayout = String(Number(t.report.raiders[0].dusdPayout) + 1_000_000); // +1 dUSD to raider 1
assert.notEqual(reportHash(t.report), file.hash, "tampered hash differs");
const dir = join(REPO, "app", "public", "test-fixtures");
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, `tampered-${id}.json`), JSON.stringify(t, null, 2));
console.log(`fixture: app/public/test-fixtures/tampered-${id}.json (raider 1 payout +1 dUSD)`);
console.log(`open: /report/${id}?src=/test-fixtures/tampered-${id}.json → expect "Mismatch"`);
