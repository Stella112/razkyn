// Debug: simulate end_raid for an existing raid on devnet-tee as the keeper and print the logs.
// usage: tsx scripts/debug-end-raid.ts <raid PDA>
import * as anchor from "@coral-xyz/anchor";
import { ComputeBudgetProgram, PublicKey, Transaction } from "@solana/web3.js";
import { MAGIC_CONTEXT_ID, MAGIC_PROGRAM_ID } from "@magicblock-labs/ephemeral-rollups-sdk";
import { RaidSession, PID } from "./raid-lib.ts";

const probe = new RaidSession(new anchor.BN(0), 1);
await probe.connectTee();
const rid = ((await probe.T.account.raid.fetch(new PublicKey(process.argv[2]))) as unknown as { raidId: anchor.BN }).raidId;
const S = new RaidSession(rid, 1);
await S.connectTee();
console.log("raid id", rid.toString(), S.raid.toBase58());
const raid = (await S.T.account.raid.fetch(S.raid)) as unknown as { raiders: { joined: boolean }[]; status: number };
const n = raid.raiders.filter((r) => r.joined).length;
console.log("status", raid.status, "joined", n);
const ix = await S.T.methods.endRaid().accountsPartial({
  payer: S.keeper.publicKey, raid: S.raid, results: S.results, config: S.config,
  district0: S.district(0), district1: S.district(1), district2: S.district(2), programId: PID,
  magicContext: MAGIC_CONTEXT_ID, magicProgram: MAGIC_PROGRAM_ID,
}).remainingAccounts(Array.from({ length: n }, (_, s) => ({ pubkey: S.slot("rprv", s), isSigner: false, isWritable: false }))).instruction();
console.log("ix accounts:", ix.keys.map((k) => `${k.pubkey.toBase58().slice(0, 6)}${k.isSigner ? "[S]" : ""}${k.isWritable ? "[W]" : ""}`).join(" "));
const tx = new Transaction().add(ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }), ix);
tx.feePayer = S.keeper.publicKey;
tx.recentBlockhash = (await S.teeK.getLatestBlockhash()).blockhash;
tx.sign(S.keeper);
const sim = await S.teeK.simulateTransaction(tx);
console.log(JSON.stringify(sim.value, null, 2));
