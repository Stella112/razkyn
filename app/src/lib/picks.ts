// RAZKYN LIVE on-chain picks — client (program instructions/picks.rs, DECISIONS #39).
// The pick book is a PUBLIC account on the TEE: anyone reads it with a token-less connection.
// A spectator registers once (wallet co-signs a TEE transaction binding a session key), then every pick
// is signed by the session key alone: no wallet popup. Credits are non-redeemable play credits.
import * as anchor from "@coral-xyz/anchor";
import { Keypair, PublicKey, Transaction, type Connection } from "@solana/web3.js";
import { Buffer } from "buffer";
import { P, PID, idl, teeAuthed, teePublic } from "./chain";

export const NUM_POOLS = 23;
export const UNRESOLVED = 255, REFUNDED = 254;
export const poolChoices = (p: number) => (p >= 8 && p < 13 ? ["TOWER", "FACTORY", "HARBOR", "NONE"] : ["YES", "NO"]);
/** Pool timing from the raid start (seconds): [open, lock, end]. */
export function poolTimes(start: number, p: number): [number, number, number] {
  if (p < 8) return [-Infinity, start + 270, start + 300];
  const crack = p < 13, w = crack ? p - 8 : p - 13, every = crack ? 60 : 30, lock = crack ? 5 : 3, watch = crack ? 60 : 30;
  const open = start + w * every;
  return [open, open + lock, Math.min(open + lock + watch, start + 300)];
}

export type Spectator = { wallet: string; session: string; credits: number; picks: number; correct: number; streak: number; bestStreak: number; badge: number; badgeClaimed: boolean };
export type Book = { raidId: string; startTs: number; totals: number[][]; spectators: Spectator[]; bets: { spec: number; pool: number; choice: number; amount: number }[]; outcome: number[]; status: number };

/** Decode the zero-copy PickBook (repr C; must match picks.rs). */
export function decodeBook(data: Uint8Array): Book {
  const b = Buffer.from(data), o = 8;
  const u32 = (x: number) => b.readUInt32LE(o + x);
  const nBets = b.readUInt16LE(o + 3168), nSpec = b[o + 3198];
  return {
    raidId: b.readBigUInt64LE(o).toString(), startTs: Number(b.readBigInt64LE(o + 8)),
    totals: Array.from({ length: NUM_POOLS }, (_, p) => [0, 1, 2, 3].map((c) => u32(16 + (p * 4 + c) * 4))),
    spectators: Array.from({ length: nSpec }, (_, i) => {
      const s = o + 384 + i * 76;
      return {
        wallet: new PublicKey(b.subarray(s, s + 32)).toBase58(), session: new PublicKey(b.subarray(s + 32, s + 64)).toBase58(),
        credits: b.readUInt32LE(s + 64), picks: b[s + 68], correct: b[s + 69], streak: b[s + 70], bestStreak: b[s + 71], badge: b[s + 72], badgeClaimed: b[s + 73] === 1,
      };
    }),
    bets: Array.from({ length: nBets }, (_, i) => { const s = o + 2208 + i * 6; return { spec: b[s], pool: b[s + 1], choice: b[s + 2], amount: b.readUInt16LE(s + 4) }; }),
    outcome: Array.from(b.subarray(o + 3170, o + 3193)), status: b[o + 3197],
  };
}
export const bookPda = (id: string) => PublicKey.findProgramAddressSync([Buffer.from("picks"), new anchor.BN(id).toArrayLike(Buffer, "le", 8)], PID)[0];
export async function readBook(id: string, conn: Connection = teePublic): Promise<Book | null> {
  const info = await conn.getAccountInfo(bookPda(id)).catch(() => null);
  return info && info.data.length >= 8 + 3208 ? decodeBook(info.data) : null;
}

/** Per-raid session key (a burner in this browser, like the raid key). */
export function sessionKey(id: string, create = false): Keypair | null {
  const k = `razkyn-spec-${id}`;
  try {
    const v = window.localStorage.getItem(k);
    if (v) return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(v)));
    if (!create) return null;
    const kp = Keypair.generate();
    window.localStorage.setItem(k, JSON.stringify(Array.from(kp.secretKey)));
    return kp;
  } catch { return create ? Keypair.generate() : null; }
}

const coder = new anchor.Program(idl, { connection: teePublic } as unknown as anchor.Provider);

/** Register: the wallet co-signs ONE TEE transaction (fee payer = session key, gasless on the rollup). */
export async function registerSpectator(id: string, wallet: PublicKey, signTx: (tx: Transaction) => Promise<Transaction>) {
  const session = sessionKey(id, true)!;
  const { conn } = await teeAuthed(session);
  const ix = await coder.methods.registerSpectator(session.publicKey).accountsPartial({ book: bookPda(id), raid: P.raid(id), wallet }).instruction();
  const tx = new Transaction().add(ix);
  tx.feePayer = session.publicKey;
  tx.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;
  tx.partialSign(session);
  const signed = await signTx(tx);
  const sig = await conn.sendRawTransaction(signed.serialize(), { skipPreflight: false });
  await conn.confirmTransaction(sig, "confirmed");
  return sig;
}

/** A pick, signed by the session key only (no wallet popup). The program clock decides if it is in time. */
export async function placePick(id: string, pool: number, choice: number, amount: number) {
  const session = sessionKey(id);
  if (!session) throw new Error("register for LIVE picks first");
  const { conn } = await teeAuthed(session);
  const ix = await coder.methods.placePick(pool, choice, amount).accountsPartial({ book: bookPda(id), raid: P.raid(id), session: session.publicKey }).instruction();
  const tx = new Transaction().add(ix);
  tx.feePayer = session.publicKey;
  tx.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;
  tx.sign(session);
  const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: false });
  const r = await conn.confirmTransaction(sig, "confirmed");
  if (r.value.err) throw new Error(`pick refused on-chain: ${JSON.stringify(r.value.err)}`);
  return sig;
}

export const PICK_ERRORS: Record<number, string> = { 6053: "Locked: this pick has closed", 6055: "Bad pick", 6056: "Register first", 6057: "You already picked here (one choice per pick)", 6058: "Not enough credits", 6054: "Book is full" };
