// Independent spectator client for the ON-CHAIN RAZKYN LIVE picks (program picks.rs, DECISIONS #39).
// Fresh wallet + session key (no SOL needed: the session key pays TEE fees, which are zero on the rollup).
// Registers once (wallet + session sign), then picks with the session key alone as windows open, and
// deliberately sends one LATE pick and one DUPLICATE pick, which the program must refuse.
//   tsx scripts/spectator-onchain.ts <raid_id>
import * as anchor from "@coral-xyz/anchor";
import { Keypair, PublicKey } from "@solana/web3.js";
import { PID, idl } from "./raid-lib.ts";
import { sendTee, sleep, teeConn } from "./spike-lib.ts";
import { decodeBook } from "../keeper/src/livepicks.ts";

const raidId = process.argv[2];
const id = new anchor.BN(raidId);
const pda = (...s: Buffer[]) => PublicKey.findProgramAddressSync(s, PID)[0];
const raid = pda(Buffer.from("raid"), id.toArrayLike(Buffer, "le", 8));
const book = pda(Buffer.from("picks"), id.toArrayLike(Buffer, "le", 8));
const wallet = Keypair.generate(), session = Keypair.generate();
const conn = await teeConn(session);
const P = new anchor.Program(idl, new anchor.AnchorProvider(conn, new anchor.Wallet(session), {}));
const code = (e: unknown) => { const m = /custom program error: 0x([0-9a-f]+)/i.exec(String(e)) ?? /"Custom":(\d+)/.exec(String(e)); return m ? (m[0].includes("0x") ? parseInt(m[1], 16) : Number(m[1])) : String(e).slice(0, 80); };
const readBook = async () => { const i = await conn.getAccountInfo(book); return i ? decodeBook(i.data) : null; };
const readRaid = async () => P.coder.accounts.decode("raid", (await conn.getAccountInfo(raid))!.data) as { status: number; startTs: anchor.BN };

console.log(`spectator wallet ${wallet.publicKey.toBase58()} session ${session.publicKey.toBase58()}`);
while (!(await readBook())) await sleep(2000);
const reg = await sendTee(conn, [await P.methods.registerSpectator(session.publicKey).accountsPartial({ book, raid, wallet: wallet.publicKey }).instruction()], [session, wallet]);
console.log(`registered (wallet signed once): ${reg.sig}`);
const pick = async (pool: number, choice: number, amount: number) => sendTee(conn, [await P.methods.placePick(pool, choice, amount).accountsPartial({ book, raid, session: session.publicKey }).instruction()], [session]);

// EXTRACTS before the drop: raider 1 YES, then a duplicate on the same pool (must be refused).
try { console.log(`EXTRACTS r1 YES · ${(await pick(0, 0, 10)).sig}`); } catch (e) { console.log(`EXTRACTS r1 refused: ${code(e)}`); }
try { await pick(0, 1, 5); console.log("DUPLICATE ACCEPTED (bug)"); } catch (e) { console.log(`duplicate refused: ${code(e)} (6057 = AlreadyPicked)`); }

let r = await readRaid();
while (r.status < 2) { await sleep(1000); r = await readRaid(); }
const start = Number(r.startTs.toString());
console.log(`raid live, start_ts ${start}`);
const done = new Set<number>();
let lateSent = false;
while (Date.now() / 1000 < start + 300) {
  const now = Date.now() / 1000;
  for (let p = 8; p < 23; p++) {
    if (done.has(p)) continue;
    const crack = p < 13, w = crack ? p - 8 : p - 13, open = start + w * (crack ? 60 : 30), lock = open + (crack ? 5 : 3);
    if (now < open) continue;
    done.add(p);
    if (now >= lock) {
      if (!lateSent) {
        lateSent = true;
        try { await pick(p, 1, 5); console.log(`LATE ${p} ACCEPTED (bug)`); } catch (e) { console.log(`late pick on pool ${p} refused by the program clock: ${code(e)} (6053 = PicksClosed)`); }
      }
      continue;
    }
    const choice = crack ? 3 : 1; // NONE / NO
    try { const t = await pick(p, choice, 5); console.log(`pool ${p} → ${crack ? "NONE" : "NO"} in ${Math.round(t.ms)} ms · ${t.sig}`); }
    catch (e) { console.log(`pool ${p} refused: ${code(e)}`); }
  }
  await sleep(200);
}
await sleep(8000);
const b = await readBook();
const me = b?.spectators.find((s) => s.wallet === wallet.publicKey.toBase58());
console.log("final:", JSON.stringify({ outcomes: b?.outcome, me, spectators: b?.spectators.length, bets: b?.bets.length, credits: b?.spectators.reduce((a, s) => a + s.credits, 0) }));
process.exit(0);
