// Spectator test client for RAZKYN LIVE picks (an independent client, its own keypair).
// Sends real devnet pick transactions (dPLAY transfer + memo) right after each window opens, plus
// deliberately LATE picks after the lock, so the keeper's chain-clock lock rule can be checked.
// The keeper funds the fresh keypair with a little devnet SOL; dPLAY comes from the free faucet.
//   tsx scripts/spectator-bot.ts <raid_id> [late_every=3]
import * as anchor from "@coral-xyz/anchor";
import { Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, TransactionInstruction } from "@solana/web3.js";
import { ASSOCIATED_TOKEN_PROGRAM_ID, createTransferCheckedInstruction, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { RaidSession, TOKEN, cfg } from "./raid-lib.ts";
import { sendBase, sleep } from "./spike-lib.ts";

const raidId = process.argv[2];
const lateEvery = Number(process.argv[3] ?? 3);
const KEEPER_URL = process.env.KEEPER_URL ?? "https://razkyn.16-61-50-207.sslip.io";
const S = new RaidSession(new anchor.BN(raidId), 0);
const PLAY = new PublicKey(cfg.mints.play);
const MEMO = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
const me = Keypair.generate();
const ata = getAssociatedTokenAddressSync(PLAY, me.publicKey, false, TOKEN);
const pda = (...seeds: Buffer[]) => PublicKey.findProgramAddressSync(seeds, S.P.programId)[0];

console.log(`spectator ${me.publicKey.toBase58()}`);
await sendBase(S.base, [SystemProgram.transfer({ fromPubkey: S.keeper.publicKey, toPubkey: me.publicKey, lamports: Math.round(0.02 * LAMPORTS_PER_SOL) })], [S.keeper]);
await sendBase(S.base, [await S.P.methods.faucetPlay(new anchor.BN(100)).accountsPartial({
  config: S.config, ledger: pda(Buffer.from("faucet"), me.publicKey.toBuffer()), mintAuth: S.mintAuth, mint: PLAY, userAta: ata, user: me.publicKey,
  tokenProgram: TOKEN, associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
}).instruction()], [me]);
console.log("funded: 0.02 SOL + 100 dPLAY");

type Pick = { type: "C" | "D"; window: number; openTs: number; lockTs: number; choices: string[] };
const book = async () => (await (await fetch(`${KEEPER_URL}/bets/${raidId}`)).json()) as { keeperAta: string; startTs: number; picks: Pick[] };
let b = await book();
while (!b.startTs) { await sleep(2000); b = await book(); }
const keeperAta = new PublicKey(b.keeperAta);
const send = async (p: Pick, choice: number, amount: number) => {
  const memo = `razkyn-pick:${raidId}:${p.type}:${p.window}:${choice}`;
  const sig = await sendBase(S.base, [
    createTransferCheckedInstruction(ata, PLAY, keeperAta, me.publicKey, BigInt(amount), 0, [], TOKEN),
    new TransactionInstruction({ programId: MEMO, keys: [{ pubkey: me.publicKey, isSigner: true, isWritable: false }], data: Buffer.from(memo) }),
  ], [me]);
  const t = await S.base.getTransaction(sig, { maxSupportedTransactionVersion: 0, commitment: "confirmed" });
  return { sig, blockTime: t?.blockTime ?? null, memo };
};
const done = new Set<string>();
let n = 0;
while (Date.now() / 1000 < b.startTs + 300) {
  const now = Date.now() / 1000;
  for (const p of b.picks) {
    const key = `${p.type}:${p.window}`;
    if (done.has(key) || now < p.openTs) continue;
    done.add(key);
    n++;
    const late = n % lateEvery === 0;
    if (late) { while (Date.now() / 1000 < p.lockTs + 2) await sleep(200); }
    else if (now >= p.lockTs) continue; // missed this one; do not send a late pick by accident
    const choice = n % p.choices.length;
    try {
      const r = await send(p, choice, 5);
      console.log(`${late ? "LATE " : "     "}${key} → ${p.choices[choice]} · lock ${p.lockTs} · block ${r.blockTime} · ${r.blockTime !== null && r.blockTime < p.lockTs ? "in time" : "after lock"} · ${r.sig}`);
    } catch (e) { console.log(`${key} send failed: ${String(e).slice(0, 100)}`); }
  }
  await sleep(250);
}
console.log("raid over; picks sent:", done.size);
process.exit(0);
