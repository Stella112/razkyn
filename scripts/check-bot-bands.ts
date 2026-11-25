// Geometry check for BOT hazard avoidance (keeper/src/bots.ts) against the program's hazard rows.
//   tsx scripts/check-bot-bands.ts
import assert from "node:assert/strict";
import { EXITS, TERMINALS, inBand } from "../keeper/src/bots.ts";

const allDanger: ([number, number] | null)[] = [[11, 28], [11, 28], [11, 28]];
const none: ([number, number] | null)[] = [null, null, null];
const factory: ([number, number] | null)[] = [null, [11, 28], null];
// Program hazard tiles (level 2 = rows 12-27) are always inside the BOT danger band.
for (let tx = 0; tx < 64; tx++) for (let ty = 12; ty <= 27; ty++) {
  const inDistrict = (tx <= 20) || (tx >= 22 && tx <= 42) || (tx >= 44);
  assert.equal(inBand(tx * 100 + 50, ty * 100 + 50, allDanger), inDistrict, `tile ${tx},${ty}`);
}
assert.equal(inBand(2150, 2050, allDanger), false, "corridor x=21 is safe");
assert.equal(inBand(3250, 2050, factory), true, "centre is on Factory hazard tiles");
assert.equal(inBand(3250, 1050, factory), false, "row 10 is safe");
assert.deepEqual(EXITS.map(([x, y]) => inBand(x, y, allDanger)), [true, false, false, true], "side exits are on hazard rows");
assert.ok(TERMINALS.every(([x, y]) => inBand(x, y, allDanger)), "terminals sit in the margin band");
assert.ok(TERMINALS.every(([x, y]) => !inBand(x, y, none)));
console.log("bot band geometry OK");
