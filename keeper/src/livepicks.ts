// RAZKYN LIVE on-chain picks — keeper side (program instructions/picks.rs, DECISIONS #39).
// The keeper is the operator here as for the raid: it creates and delegates the pick book, schedules
// the resolve crank (ScheduleCrankCpi, 1 s), also calls resolve_picks itself as a fallback (idempotent),
// closes the book after the raid (badges from the VRF seed + commit to Solana), claims badges for
// every winner, and cancels (refunds) if a raid fails. It never decides an outcome: resolve_picks
// reads only public accounts on the TEE.
import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { MAGIC_CONTEXT_ID, MAGIC_PROGRAM_ID } from "@magicblock-labs/ephemeral-rollups-sdk";
import { TEE_VALIDATOR, sendBase, sendTee, sleep } from "../../scripts/spike-lib.ts";
import { TOKEN, type RaidSession } from "../../scripts/raid-lib.ts";

export const NUM_POOLS = 23;
export const POOL_NAMES = (p: number) => (p < 8 ? `EXTRACTS · raider ${p + 1}` : p < 13 ? `NEXT CRACK ${p - 7}` : `KNOCKOUT IN 30 S ${p - 12}`);
export const POOL_CHOICES = (p: number) => (p >= 8 && p < 13 ? ["TOWER", "FACTORY", "HARBOR", "NONE"] : ["YES", "NO"]);
export const UNRESOLVED = 255, REFUNDED = 254;

export type Spectator = { wallet: string; session: string; credits: number; picks: number; correct: number; streak: number; bestStreak: number; badge: number; badgeClaimed: boolean };
export type PickBetRow = { spec: number; pool: number; choice: number; amount: number };
export type Book = { raidId: string; startTs: number; totals: number[][]; spectators: Spectator[]; bets: PickBetRow[]; outcome: number[]; status: number; inited: boolean };

/** Decode the zero-copy PickBook (repr C, layout in picks.rs; 8-byte discriminator first). */
export function decodeBook(data: Buffer | Uint8Array): Book {
  const b = Buffer.from(data);
  const o = 8;
  const u32 = (x: number) => b.readUInt32LE(o + x);
  const totals = Array.from({ length: NUM_POOLS }, (_, p) => [0, 1, 2, 3].map((c) => u32(16 + (p * 4 + c) * 4)));
  const nBets = b.readUInt16LE(o + 3168);
  const nSpec = b[o + 3198];
  const spectators = Array.from({ length: nSpec }, (_, i) => {
    const s = o + 384 + i * 76;
    return {
      wallet: new PublicKey(b.subarray(s, s + 32)).toBase58(), session: new PublicKey(b.subarray(s + 32, s + 64)).toBase58(),
      credits: b.readUInt32LE(s + 64), picks: b[s + 68], correct: b[s + 69], streak: b[s + 70], bestStreak: b[s + 71], badge: b[s + 72], badgeClaimed: b[s + 73] === 1,
    };
  });
  const bets = Array.from({ length: nBets }, (_, i) => { const s = o + 2208 + i * 6; return { spec: b[s], pool: b[s + 1], choice: b[s + 2], amount: b.readUInt16LE(s + 4) }; });
  return {
    raidId: b.readBigUInt64LE(o).toString(), startTs: Number(b.readBigInt64LE(o + 8)), totals, spectators, bets,
    outcome: Array.from(b.subarray(o + 3170, o + 3193)), status: b[o + 3197], inited: b[o + 3200] === 1,
  };
}

/** Share of picks that called the outcome and the payout multiple, from the recorded book. */
export function poolStats(book: Book, pool: number) {
  const on = book.bets.filter((x) => x.pool === pool);
  const out = book.outcome[pool];
  const total = on.reduce((a, x) => a + x.amount, 0);
  const win = on.filter((x) => x.choice === out).reduce((a, x) => a + x.amount, 0);
  return { bets: on.length, total, pct: on.length ? Math.round((on.filter((x) => x.choice === out).length / on.length) * 100) : 0, mult: win ? Math.round((total / win) * 10) / 10 : 0 };
}

/** Leaderboard: correct picks, then credits, then best streak. */
export const boardOf = (book: Book) => [...book.spectators].sort((a, c) => c.correct - a.correct || c.credits - a.credits || c.bestStreak - a.bestStreak);

export class LivePicks {
  readonly book: PublicKey;
  readonly badgeMint: PublicKey;
  sigs: Record<string, string | string[]> = {};
  constructor(readonly S: RaidSession) {
    this.book = PublicKey.findProgramAddressSync([Buffer.from("picks"), S.raidId.toArrayLike(Buffer, "le", 8)], S.P.programId)[0];
    this.badgeMint = PublicKey.findProgramAddressSync([Buffer.from("badge_mint")], S.P.programId)[0];
  }
  private ids() {
    const d = (i: number) => this.S.district(i);
    const r = (s: number) => this.S.slot("rpub", s);
    return { book: this.book, raid: this.S.raid, district0: d(0), district1: d(1), district2: d(2), rpub0: r(0), rpub1: r(1), rpub2: r(2), rpub3: r(3), rpub4: r(4), rpub5: r(5), rpub6: r(6), rpub7: r(7) };
  }
  /** Base, raid still in the lobby: create the book and delegate it to the TEE validator. */
  async createAndDelegate() {
    const S = this.S;
    this.sigs.create = await sendBase(S.base, [await S.P.methods.createPickBook(S.raidId).accountsPartial({ config: S.config, raid: S.raid, book: this.book, keeper: S.keeper.publicKey }).instruction()], [S.keeper]);
    this.sigs.delegate = await sendBase(S.base, [await S.P.methods.delegatePda(S.raidId, { picks: {} } as never).accountsPartial({ config: S.config, pda: this.book, keeper: S.keeper.publicKey, validator: TEE_VALIDATOR }).instruction()], [S.keeper]);
  }
  /** Base, once per program: the badge mint (PDA, mint authority = program). */
  async ensureBadgeMint() {
    if (await this.S.base.getAccountInfo(this.badgeMint)) return;
    await sendBase(this.S.base, [await this.S.P.methods.initBadgeMint().accountsPartial({ config: this.S.config, mintAuth: this.S.mintAuth, badgeMint: this.badgeMint, keeper: this.S.keeper.publicKey, tokenProgram: TOKEN }).instruction()], [this.S.keeper]);
  }
  /** TEE: the crank runs resolve_picks every second for the whole raid. */
  async scheduleCrank() {
    const S = this.S;
    const ix = await S.T.methods.schedulePickCrank(new anchor.BN(Number(S.raidId.toString().slice(-9))), new anchor.BN(1000), new anchor.BN(330))
      .accountsPartial({ magicProgram: MAGIC_PROGRAM_ID, payer: S.keeper.publicKey, ...this.ids() }).instruction();
    this.sigs.crank = (await sendTee(S.teeK, [ix], [S.keeper])).sig;
  }
  /** TEE: permissionless resolve (fallback next to the crank; idempotent). */
  async resolve() {
    const ix = await this.S.T.methods.resolvePicks().accountsPartial(this.ids()).instruction();
    return (await sendTee(this.S.teeK, [ix], [this.S.keeper])).sig;
  }
  async read(): Promise<Book | null> {
    const info = await this.S.teeK.getAccountInfo(this.book).catch(() => null);
    return info ? decodeBook(info.data) : null;
  }
  /** TEE: refund every open pool (failed or cancelled raid). */
  async cancel() {
    const ix = await this.S.T.methods.cancelPicks().accountsPartial({ book: this.book, raid: this.S.raid, keeper: this.S.keeper.publicKey }).instruction();
    this.sigs.cancel = (await sendTee(this.S.teeK, [ix], [this.S.keeper])).sig;
  }
  /** After the raid: resolve the rest, close (badges + commit/undelegate), wait for base, claim badges. */
  async closeAndClaim(log: (m: string) => void) {
    const S = this.S;
    for (let i = 0; i < 6; i++) {
      await this.resolve().catch(() => null);
      const b = await this.read();
      if (b && b.outcome.every((x) => x !== UNRESOLVED)) break;
      await sleep(1500);
    }
    const close = await S.T.methods.closePicks(S.raidId).accountsPartial({ payer: S.keeper.publicKey, book: this.book, secret: S.secret, magicContext: MAGIC_CONTEXT_ID, magicProgram: MAGIC_PROGRAM_ID }).instruction();
    this.sigs.close = (await sendTee(S.teeK, [close], [S.keeper])).sig;
    // Wait until the book is back on base, owned by the program.
    let onBase: Book | null = null;
    for (let i = 0; i < 40; i++) {
      const info = await S.base.getAccountInfo(this.book);
      if (info && info.owner.equals(S.P.programId)) { onBase = decodeBook(info.data); if (onBase.status === 1) break; }
      await sleep(3000);
    }
    if (!onBase) { log("picks: book not back on base yet; badges can be claimed later (claim_badge is permissionless)"); return null; }
    const claims: string[] = [];
    for (let i = 0; i < onBase.spectators.length; i++) {
      const s = onBase.spectators[i];
      if (!s.badge || s.badgeClaimed) continue;
      try {
        await this.ensureBadgeMint();
        const wallet = new PublicKey(s.wallet);
        const ix = await S.P.methods.claimBadge(S.raidId, i).accountsPartial({
          config: S.config, book: this.book, mintAuth: S.mintAuth, badgeMint: this.badgeMint, wallet,
          walletAta: getAssociatedTokenAddressSync(this.badgeMint, wallet, false, TOKEN), payer: S.keeper.publicKey,
          tokenProgram: TOKEN, associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        }).instruction();
        claims.push(await sendBase(S.base, [ix], [S.keeper]));
      } catch (e) { log(`picks: badge claim for ${s.wallet.slice(0, 6)} failed: ${String(e).slice(0, 100)}`); }
    }
    this.sigs.badgeClaims = claims;
    return onBase;
  }
}
