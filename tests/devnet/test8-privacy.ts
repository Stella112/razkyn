// §9 test 8 — privacy on devnet-tee: with a token for a key that is no permission member, read a
// sealed crate, another raider's RaiderPrivate and View, and RaidSecret → every read empty.
// Positive control: the keeper (a member) reads the same accounts, so "empty" is not just an
// RPC failure. Run while a raid is live:  tsx tests/devnet/test8-privacy.ts <raid_id>
import assert from "node:assert/strict";
import * as anchor from "@coral-xyz/anchor";
import { Keypair, PublicKey } from "@solana/web3.js";
import { RaidSession } from "../../scripts/raid-lib.ts";
import { saveEvidence, teeConn } from "../../scripts/spike-lib.ts";

const S = new RaidSession(new anchor.BN(process.argv[2]), 0);
await S.connectTee();
const raid = (await S.readRaid()) as unknown as { status: number; raiders: { joined: boolean }[]; cratePos: unknown[] };
const stranger = await teeConn(Keypair.generate());
const sealed: number[] = [];
for (let i = 0; i < 36 && sealed.length < 3; i++) {
  const c = await S.crateAcc(i).catch(() => null);
  if (c && c.state === 0) sealed.push(i);
}
const slots = raid.raiders.map((r, s) => (r.joined ? s : -1)).filter((s) => s >= 0).slice(0, 2);
const targets: { name: string; key: PublicKey }[] = [
  ...sealed.map((i) => ({ name: `sealed crate ${i}`, key: S.crate(i) })),
  ...slots.flatMap((s) => [{ name: `RaiderPrivate ${s}`, key: S.slot("rprv", s) }, { name: `View ${s}`, key: S.slot("view", s) }]),
  { name: "RaidSecret", key: S.secret },
];
const rows = [];
for (const t of targets) {
  const asStranger = await stranger.getAccountInfo(t.key).catch((e) => `error: ${String(e).slice(0, 60)}`);
  const asKeeper = await S.teeK.getAccountInfo(t.key);
  rows.push({ account: t.name, pubkey: t.key.toBase58(), stranger: asStranger === null ? "null" : typeof asStranger === "string" ? asStranger : `${asStranger.data.length} bytes`, keeper: asKeeper ? `${asKeeper.data.length} bytes` : "null" });
  assert.ok(asStranger === null || typeof asStranger === "string", `${t.name} readable by a non-member`);
  // Control: the keeper is a member of crates, RaiderPrivate and RaidSecret (§6.2), so it must read
  // them. A View's only member is that raider's raid key, so the keeper must NOT read it either.
  if (t.name.startsWith("View")) assert.equal(asKeeper, null, `${t.name}: readable by the keeper, but only the raider is a member`);
  else assert.ok(asKeeper, `${t.name}: keeper (member) cannot read it either — control failed`);
}
console.table(rows);
// Public accounts stay public to the stranger (sanity).
assert.ok(await stranger.getAccountInfo(S.raid), "Raid should be public");
saveEvidence(`test8-privacy-${process.argv[2]}`, { raidStatus: raid.status, rows });
console.log(`TEST 8 PASS: ${rows.length}/${rows.length} private reads refused for a non-member; keeper control read all of them`);
process.exit(0);
