// Extraction Market (spectator betting, CLAUDE.md §2 / §6.3 place_bet, DECISIONS #33).
// Play-money only: dPLAY (devnet, 0 decimals, free faucet). A bet is a real devnet transfer of
// dPLAY from the spectator's wallet to the keeper's dPLAY account, tagged with an SPL memo
//   razkyn-bet:<raidId>:<slot>:<Y|N>
// The keeper reads those transfers from chain, accepts the ones confirmed before betting closes
// (raid start + 270 s, i.e. 30 s before the last exit window ends), and after settlement pays the
// winning side of each raider's pool pro rata (parimutuel, no fee) from the committed extraction
// result. Late bets and pools with no winners are refunded. Every payout is a devnet transaction
// listed in the report.
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction, createTransferCheckedInstruction, getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import type { RaidSession } from "../../scripts/raid-lib.ts";
import { TOKEN, cfg } from "../../scripts/raid-lib.ts";
import { sendBase } from "../../scripts/spike-lib.ts";

export const MEMO_PROGRAM = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
export const PLAY = new PublicKey(cfg.mints.play);
export const PLAY_DECIMALS = 0;
export const BET_CLOSE_SECS = 270;

export type Bet = { sig: string; bettor: string; slot: number; side: "Y" | "N"; amount: number; ts: number; late: boolean };
export type Payout = { bettor: string; amount: number; reason: "win" | "refund"; sig?: string };

export class BetBook {
  readonly bets: Bet[] = [];
  readonly seen = new Set<string>();
  payouts: Payout[] = [];
  settled = false;
  outcomes: boolean[] | null = null;
  readonly ata: PublicKey;

  constructor(readonly S: RaidSession, readonly raidId: string, readonly closeTs: number) {
    this.ata = getAssociatedTokenAddressSync(PLAY, S.keeper.publicKey, false, TOKEN);
  }

  /** The keeper's dPLAY account must exist before anyone can bet into it. */
  async ensureAta() {
    if (await this.S.base.getAccountInfo(this.ata)) return;
    await sendBase(this.S.base, [createAssociatedTokenAccountIdempotentInstruction(this.S.keeper.publicKey, this.ata, this.S.keeper.publicKey, PLAY, TOKEN)], [this.S.keeper]);
  }

  /** Read new transfers into the keeper's dPLAY account and record the bets for this raid. */
  async poll() {
    const sigs = await this.S.base.getSignaturesForAddress(this.ata, { limit: 100 });
    for (const s of sigs.reverse()) {
      if (this.seen.has(s.signature) || s.err) continue;
      this.seen.add(s.signature);
      const tx = await this.S.base.getParsedTransaction(s.signature, { maxSupportedTransactionVersion: 0, commitment: "confirmed" }).catch(() => null);
      if (!tx) { this.seen.delete(s.signature); continue; }
      let memo = "", amount = 0, bettor = "";
      for (const ix of tx.transaction.message.instructions) {
        const p = ix as { program?: string; parsed?: unknown; programId: PublicKey };
        if (p.programId.equals(MEMO_PROGRAM) && typeof p.parsed === "string") memo = p.parsed;
        const parsed = p.parsed as { type?: string; info?: { destination?: string; mint?: string; authority?: string; tokenAmount?: { amount: string } } } | undefined;
        if (parsed?.type === "transferChecked" && parsed.info?.destination === this.ata.toBase58() && parsed.info.mint === PLAY.toBase58()) {
          amount += Number(parsed.info.tokenAmount?.amount ?? 0);
          bettor = parsed.info.authority ?? bettor;
        }
      }
      const m = /^razkyn-bet:(\d+):([0-7]):([YN])$/.exec(memo.trim());
      if (!m || m[1] !== this.raidId || amount <= 0 || !bettor) continue;
      const ts = tx.blockTime ?? s.blockTime ?? Math.floor(Date.now() / 1000);
      this.bets.push({ sig: s.signature, bettor, slot: Number(m[2]), side: m[3] as "Y" | "N", amount, ts, late: ts > this.closeTs });
    }
  }

  pools() {
    return Array.from({ length: 8 }, (_, slot) => {
      const on = this.bets.filter((b) => b.slot === slot && !b.late);
      const yes = on.filter((b) => b.side === "Y").reduce((a, b) => a + b.amount, 0);
      const no = on.filter((b) => b.side === "N").reduce((a, b) => a + b.amount, 0);
      return { slot, yes, no, count: on.length };
    });
  }

  /** Parimutuel payout per raider pool from the committed outcome (extracted or not). */
  async settle(extracted: boolean[]) {
    if (this.settled) return this.payouts;
    await this.poll();
    this.outcomes = extracted;
    const owed = new Map<string, Payout>();
    const add = (bettor: string, amount: number, reason: Payout["reason"]) => {
      if (amount <= 0) return;
      const k = `${bettor}:${reason}`;
      const cur = owed.get(k);
      if (cur) cur.amount += amount; else owed.set(k, { bettor, amount, reason });
    };
    for (const b of this.bets.filter((x) => x.late)) add(b.bettor, b.amount, "refund");
    for (let slot = 0; slot < 8; slot++) {
      const on = this.bets.filter((b) => b.slot === slot && !b.late);
      if (!on.length) continue;
      const win = extracted[slot] ? "Y" : "N";
      const winners = on.filter((b) => b.side === win);
      const total = on.reduce((a, b) => a + b.amount, 0);
      const wsum = winners.reduce((a, b) => a + b.amount, 0);
      if (!wsum) { for (const b of on) add(b.bettor, b.amount, "refund"); continue; }
      // floor(stake × pool / winning stake); integer dPLAY, any remainder (< 1 per winner) stays with the keeper.
      for (const b of winners) add(b.bettor, Math.floor((b.amount * total) / wsum), "win");
    }
    const list = [...owed.values()];
    for (let i = 0; i < list.length; i += 6) {
      const chunk = list.slice(i, i + 6);
      const ixs: TransactionInstruction[] = [];
      for (const p of chunk) {
        const owner = new PublicKey(p.bettor);
        const dest = getAssociatedTokenAddressSync(PLAY, owner, false, TOKEN);
        ixs.push(createAssociatedTokenAccountIdempotentInstruction(this.S.keeper.publicKey, dest, owner, PLAY, TOKEN));
        ixs.push(createTransferCheckedInstruction(this.ata, PLAY, dest, this.S.keeper.publicKey, BigInt(p.amount), PLAY_DECIMALS, [], TOKEN));
      }
      try {
        const sig = await sendBase(this.S.base, ixs, [this.S.keeper]);
        chunk.forEach((p) => (p.sig = sig));
      } catch (e) {
        chunk.forEach((p) => (p.sig = `failed: ${String(e).slice(0, 60)}`));
      }
    }
    this.payouts = list;
    this.settled = true;
    return list;
  }

  /** Public view for the client and the report. */
  view() {
    return {
      raidId: this.raidId, closeTs: this.closeTs, open: !this.settled && Date.now() / 1000 < this.closeTs, keeperAta: this.ata.toBase58(),
      mint: PLAY.toBase58(), pools: this.pools(), bets: this.bets.map((b) => ({ ...b })), settled: this.settled, outcomes: this.outcomes, payouts: this.payouts,
    };
  }
}
