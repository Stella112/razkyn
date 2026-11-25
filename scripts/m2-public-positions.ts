// Devnet check for DECISIONS #16: crate positions are public in Raid.crate_pos; crate
// contents stay private until opened.
// usage: tsx scripts/m2-public-positions.ts
import * as anchor from "@coral-xyz/anchor";
import { Connection, Keypair } from "@solana/web3.js";
import { TEE_RPC, loadKeypair, saveEvidence, teeConn } from "./spike-lib.ts";
import { RaidSession, NUM_CRATES, programFor } from "./raid-lib.ts";

const S = new RaidSession(new anchor.BN(Date.now()), 1);
await S.createRaid(2);
await S.join(0, loadKeypair("playerA"));
await S.join(1, loadKeypair("playerB"));
const delegated = await S.delegateAll();
await S.connectTee();
await S.teeSetup(delegated);
await S.seed();
await S.placeCrates();

// A stranger: valid TEE token, member of nothing. Also a reader with no token at all.
const strangerKp = Keypair.generate();
const stranger = await teeConn(strangerKp);
const noToken = new Connection(TEE_RPC, "confirmed");
const decodeRaid = (data: Buffer) => S.T.coder.accounts.decode("raid", data) as { cratePos: { x: number; y: number }[]; cratesPlaced: anchor.BN };
const rows = [];
let matches = 0, hidden = 0;
for (const [label, conn] of [["stranger token", stranger], ["no token", noToken]] as const) {
  const info = await conn.getAccountInfo(S.raid);
  if (!info) { rows.push({ reader: label, raid: "null" }); continue; }
  const raid = decodeRaid(info.data);
  for (let i = 0; i < NUM_CRATES; i++) {
    const c = await S.crateAcc(i); // keeper (member) view of the private crate
    if (raid.cratePos[i].x === c.x && raid.cratePos[i].y === c.y) matches++;
    if (!(await conn.getAccountInfo(S.crate(i)))) hidden++;
  }
  rows.push({ reader: label, raid: `data (${info.data.length} B)` });
}
const result = {
  when: new Date().toISOString(), raid: S.raid.toBase58(), placeCratesSig: (S.sigs.placeCrates as string[])[0],
  readers: rows, positionsMatchingPrivateCrates: `${matches}/${2 * NUM_CRATES}`, crateContentsHidden: `${hidden}/${2 * NUM_CRATES}`,
  pass: matches === 2 * NUM_CRATES && hidden === 2 * NUM_CRATES,
};
console.log(JSON.stringify(result, null, 2));
saveEvidence("m2-public-positions", result);
void programFor;
