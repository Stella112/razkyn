// Reads a raid's public v2 fields (classes, market event state) from the TEE with a non-member token.
// Usage: tsx scripts/check-raid-events.ts <raid_id>
import * as anchor from "@coral-xyz/anchor";
import { Keypair, PublicKey } from "@solana/web3.js";
import { idl, PID } from "./raid-lib.ts";
import { teeConn } from "./spike-lib.ts";
const id = new anchor.BN(process.argv[2]);
const raid = PublicKey.findProgramAddressSync([Buffer.from("raid"), id.toArrayLike(Buffer, "le", 8)], PID)[0];
const conn = await teeConn(Keypair.generate());
const info = await conn.getAccountInfo(raid);
const r = new anchor.Program(idl, new anchor.AnchorProvider(conn, new anchor.Wallet(Keypair.generate()), {})).coder.accounts.decode("raid", info!.data);
const now = Math.floor(Date.now() / 1000);
console.log(JSON.stringify({ mode: r.mode, status: r.status, elapsed: now - Number(r.startTs), classes: r.classes, eventKind: r.eventKind, eventDistrict: r.eventDistrict, eventUntil: Number(r.eventUntil), eventsFired: r.eventsFired, eventPlanHash: Buffer.from(r.eventPlanHash).toString("hex") }));
process.exit(0);
