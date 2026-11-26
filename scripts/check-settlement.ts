// Read a raid's base-layer Settlement record (settled flag, how: 1 = Magic Action, 2 = settle_stuck_raid).
//   tsx scripts/check-settlement.ts <raid_id>
import * as anchor from "@coral-xyz/anchor";
import { Keypair, PublicKey } from "@solana/web3.js";
import { PID, idl } from "./raid-lib.ts";
import { baseConn } from "./spike-lib.ts";
const id = new anchor.BN(process.argv[2]);
const pda = PublicKey.findProgramAddressSync([Buffer.from("settle"), id.toArrayLike(Buffer, "le", 8)], PID)[0];
const P = new anchor.Program(idl, new anchor.AnchorProvider(baseConn(), new anchor.Wallet(Keypair.generate()), {}));
const info = await baseConn().getAccountInfo(pda);
const s = P.coder.accounts.decode("settlement", info!.data) as { settled: boolean; settledVia: number; dusdPaid: anchor.BN };
console.log(JSON.stringify({ pda: pda.toBase58(), settled: s.settled, via: s.settledVia, dusdPaid: s.dusdPaid.toString() }));
process.exit(0);
