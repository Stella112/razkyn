// RAZKYN client chain layer: PDAs, connections, TEE auth (getAuthToken with the raid key),
// public/private readers and gameplay instruction builders.
// MagicBlock identifiers: getAuthToken, permissionPdaFromAccount, PERMISSION_PROGRAM_ID,
// EPHEMERAL_VAULT_ID, MAGIC_PROGRAM_ID from @magicblock-labs/ephemeral-rollups-sdk 0.18.0
// (vendor/ephemeral-rollups-sdk/ts/web3js/src/{access-control/auth.ts,pda.ts,constants.ts});
// token caching follows vendor/magicblock-engine-examples/rock-paper-scissor/anchor/app/src/lib/rps.ts.
import * as anchor from "@coral-xyz/anchor";
import {
  ComputeBudgetProgram, Connection, Keypair, PublicKey, Transaction, TransactionInstruction,
} from "@solana/web3.js";
import { ASSOCIATED_TOKEN_PROGRAM_ID, createTransferCheckedInstruction, getAssociatedTokenAddressSync } from "@solana/spl-token";
import {
  EPHEMERAL_VAULT_ID, MAGIC_PROGRAM_ID, PERMISSION_PROGRAM_ID, getAuthToken, permissionPdaFromAccount,
} from "@magicblock-labs/ephemeral-rollups-sdk";
import nacl from "tweetnacl";
import { Buffer } from "buffer";
import idlJson from "./razkyn.json";
import idlV1Json from "./razkyn.v1.json"; // program v1 layout: decodes raids created before the v2 upgrade
import devnet from "./devnet.json";
import { BASE_RPC, TEE_RPC } from "./config";

export const idl = idlJson as anchor.Idl;
export const PID = new PublicKey((idlJson as { address: string }).address);
export const TOKEN = new PublicKey(devnet.tokenProgram);
export const DUSD = new PublicKey(devnet.mints.dusd);
export const ASSET_MINTS = [devnet.mints.twr, devnet.mints.fac, devnet.mints.hrb].map((m) => new PublicKey(m));
export const NUM_CRATES = 36;
export const DROP_BASE = 36;
export const STAKE = 10_000_000;
export const PRICE_ONE = 1_000_000;

export const base = new Connection(BASE_RPC, "confirmed");
/** TEE without a token: public accounts only (private ones read as null). Watch mode and THE WIRE use this. */
export const teePublic = new Connection(TEE_RPC, "confirmed");

const coderProgram = new anchor.Program(idl, { connection: base } as unknown as anchor.Provider);
export const coder = coderProgram.coder.accounts;
const coderV1 = new anchor.Program(idlV1Json as anchor.Idl, { connection: base } as unknown as anchor.Provider).coder.accounts;

const pda = (...seeds: (Buffer | Uint8Array)[]) => PublicKey.findProgramAddressSync(seeds, PID)[0];
const le8 = (id: string) => new anchor.BN(id).toArrayLike(Buffer, "le", 8);
export const P = {
  config: () => pda(Buffer.from("config")),
  mintAuth: () => pda(Buffer.from("mint_auth")),
  faucet: (w: PublicKey) => pda(Buffer.from("faucet"), w.toBuffer()),
  raid: (id: string) => pda(Buffer.from("raid"), le8(id)),
  secret: (id: string) => pda(Buffer.from("secret"), le8(id)),
  escrowAuth: (id: string) => pda(Buffer.from("escrow"), le8(id)),
  results: (id: string) => pda(Buffer.from("results"), le8(id)),
  settlement: (id: string) => pda(Buffer.from("settle"), le8(id)),
  slot: (seed: string, id: string, s: number) => pda(Buffer.from(seed), le8(id), Buffer.from([s])),
};
export const escrowAta = (id: string) => getAssociatedTokenAddressSync(DUSD, P.escrowAuth(id), true, TOKEN);
export const walletAta = (w: PublicKey, mint = DUSD) => getAssociatedTokenAddressSync(mint, w, false, TOKEN);

// ---------------- decoded shapes (camelCase, from the IDL) ----------------
type BN = anchor.BN;
export type RaiderSlot = { wallet: PublicKey; raidKey: PublicKey; stake: BN; joined: boolean; alive: boolean; extracted: boolean; isBot: boolean };
export type RaidAcc = {
  raidId: BN; mode: number; status: number; joinedCount: number; startTs: BN; endTs: BN; tickNo: BN; marketStep: number;
  cratePos: { x: number; y: number }[]; exitWindow: number; openExits: number[]; raiders: RaiderSlot[]; dayRoot: number[]; settled: boolean;
  vrfState: number;
  /** v2 fields (absent on raids created before the upgrade). */
  classes?: number[]; eventKind?: number; eventDistrict?: number; eventUntil?: BN; eventsFired?: number;
};
export type DistrictAcc = { index: number; hazardLevel: number; startPrice: BN; currentPrice: BN; history: BN[]; histLen: number; histPos: number; awake: boolean };
export type RpubAcc = { slot: number; hp: number; alive: boolean; extracted: boolean; exposed: boolean; isBot: boolean; kills: number; pubX: number; pubY: number };
export type RprvAcc = { slot: number; raidKey: PublicKey; x: number; y: number; backpack: BN[]; channelKind: number; channelArg: number; channelStartSlot: BN; channelUnits: BN; lastShotSlot: BN };
export type ViewAcc = { tickNo: BN; count: number; entries: { slot: number; x: number; y: number }[] };
export type CrateAcc = { idx: number; district: number; dormant: boolean; placed: boolean; state: number; x: number; y: number; units: BN[]; openedUnits: BN[]; openedBy: number };

export const decode = <T>(name: string, data: Buffer | null | undefined): T | null => {
  if (!data) return null;
  try { return coder.decode(name, data) as T; } catch { /* older layout */ }
  try { return coderV1.decode(name, data) as T; } catch { return null; }
};

/** Everything public about a raid, in one getMultipleAccountsInfo through `conn`. */
export type PublicState = { raid: RaidAcc | null; districts: (DistrictAcc | null)[]; rpubs: (RpubAcc | null)[]; crates: (CrateAcc | null)[]; at: number };
export async function readPublic(conn: Connection, id: string): Promise<PublicState> {
  const keys = [P.raid(id), ...[0, 1, 2].map((i) => P.slot("district", id, i)), ...Array.from({ length: 8 }, (_, s) => P.slot("rpub", id, s)),
    ...Array.from({ length: NUM_CRATES + 8 }, (_, i) => P.slot("crate", id, i))];
  const infos = await conn.getMultipleAccountsInfo(keys);
  return {
    raid: decode<RaidAcc>("raid", infos[0]?.data),
    districts: infos.slice(1, 4).map((i) => decode<DistrictAcc>("district", i?.data)),
    rpubs: infos.slice(4, 12).map((i) => decode<RpubAcc>("raiderPublic", i?.data)),
    crates: infos.slice(12).map((i) => decode<CrateAcc>("crate", i?.data)),
    at: Date.now(),
  };
}

/** The raid as seen on the base layer (lobby phase, and after settlement). */
export async function readRaidBase(id: string) {
  return decode<RaidAcc>("raid", (await base.getAccountInfo(P.raid(id)))?.data);
}

// ---------------- raid key (burner) + TEE auth ----------------
const rkKey = (id: string) => `razkyn-raidkey-${id}`;
export function raidKeyFor(id: string, create = false): Keypair | null {
  try {
    const s = window.localStorage.getItem(rkKey(id));
    if (s) return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(s)));
    if (!create) return null;
    const k = Keypair.generate();
    window.localStorage.setItem(rkKey(id), JSON.stringify(Array.from(k.secretKey)));
    return k;
  } catch {
    return create ? Keypair.generate() : null;
  }
}

/** TEE connection authenticated as `kp`; token cached and refreshed 60 s before it expires (§8). */
export async function teeAuthed(kp: Keypair): Promise<{ conn: Connection; url: string; expiresAt: number }> {
  const cacheKey = `razkyn-tee-token-${kp.publicKey.toBase58()}`;
  let auth: { token: string; expiresAt: number } | null = null;
  try { auth = JSON.parse(window.localStorage.getItem(cacheKey) ?? "null"); } catch { auth = null; }
  const expMs = (a: { expiresAt: number }) => (a.expiresAt > 1e12 ? a.expiresAt : a.expiresAt * 1000);
  if (!auth || expMs(auth) - Date.now() < 60_000) {
    auth = await getAuthToken(TEE_RPC, kp.publicKey, (m: Uint8Array) => Promise.resolve(nacl.sign.detached(m, kp.secretKey)));
    try { window.localStorage.setItem(cacheKey, JSON.stringify(auth)); } catch { /* private mode */ }
  }
  const url = `${TEE_RPC}?token=${auth.token}`;
  return { conn: new Connection(url, { commitment: "confirmed", wsEndpoint: `${TEE_RPC.replace(/^http/, "ws")}?token=${auth.token}` }), url, expiresAt: expMs(auth) };
}

export async function readMine(conn: Connection, id: string, slot: number) {
  const [rprv, view] = await conn.getMultipleAccountsInfo([P.slot("rprv", id, slot), P.slot("view", id, slot)]);
  return { rprv: decode<RprvAcc>("raiderPrivate", rprv?.data), view: decode<ViewAcc>("view", view?.data) };
}

// ---------------- gameplay (raid key signs on the TEE; gasless) ----------------
export class RaidPlayer {
  private prog: anchor.Program;
  private bh: { hash: string; at: number } | null = null;
  private nonce = 0;
  constructor(readonly conn: Connection, readonly raidKey: Keypair, readonly id: string, readonly slot: number) {
    // anchor.Wallet (NodeWallet) is not in Anchor's browser build: minimal wallet, as in the RPS template.
    const wallet = {
      publicKey: raidKey.publicKey,
      signTransaction: async <T,>(tx: T) => { (tx as unknown as Transaction).partialSign(raidKey); return tx; },
      signAllTransactions: async <T,>(txs: T[]) => { txs.forEach((tx) => (tx as unknown as Transaction).partialSign(raidKey)); return txs; },
    } as unknown as anchor.Wallet;
    this.prog = new anchor.Program(idl, new anchor.AnchorProvider(conn, wallet, { commitment: "confirmed" }));
  }
  private get m() { return this.prog.methods; }
  private acc(seed: string, s = this.slot) { return P.slot(seed, this.id, s); }

  /** Fast send: preflight on (on the ER it returns the error), no confirmation poll. */
  async send(ix: TransactionInstruction): Promise<string> {
    if (!this.bh || Date.now() - this.bh.at > 1500) this.bh = { hash: (await this.conn.getLatestBlockhash()).blockhash, at: Date.now() };
    // A varying CU limit keeps otherwise identical txs (same move, same blockhash) distinct.
    const tx = new Transaction().add(ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 + (this.nonce++ % 1000) }), ix);
    tx.feePayer = this.raidKey.publicKey;
    tx.recentBlockhash = this.bh.hash;
    tx.sign(this.raidKey);
    return this.conn.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 0 });
  }

  moveIx(dx: number, dy: number) {
    return this.m.moveTo(this.slot, dx, dy).accountsPartial({ raid: P.raid(this.id), rprv: this.acc("rprv"), raidKey: this.raidKey.publicKey }).instruction();
  }
  shootIx(target: number) {
    return this.m.shoot(this.slot, target).accountsPartial({
      raid: P.raid(this.id), shooterPrv: this.acc("rprv"), shooterPub: this.acc("rpub"), targetPrv: this.acc("rprv", target),
      targetPub: this.acc("rpub", target), dropCrate: P.slot("crate", this.id, DROP_BASE + target), raidKey: this.raidKey.publicKey,
    }).instruction();
  }
  openIx(idx: number, district: number) {
    return this.m.openCrate(this.slot, idx).accountsPartial({
      raid: P.raid(this.id), rprv: this.acc("rprv"), crateAcc: P.slot("crate", this.id, idx), district: P.slot("district", this.id, district),
      raidKey: this.raidKey.publicKey,
    }).instruction();
  }
  finishOpenIx(idx: number) {
    const crate = P.slot("crate", this.id, idx);
    return this.m.finishOpen(this.slot, idx).accountsPartial({
      raid: P.raid(this.id), rprv: this.acc("rprv"), crateAcc: crate, cratePermission: (idx < NUM_CRATES ? permissionPdaFromAccount(crate) : null) as PublicKey, // drop crates have none
      raidKey: this.raidKey.publicKey, permissionProgram: PERMISSION_PROGRAM_ID, ephemeralVault: EPHEMERAL_VAULT_ID, magicProgram: MAGIC_PROGRAM_ID,
    }).instruction();
  }
  /** `district`: the district the terminal stands in (the program checks it and refuses during a TRADING HALT). */
  startTradeIx(from: number, to: number, units: anchor.BN, district: number) {
    return this.m.startTrade(this.slot, from, to, units).accountsPartial({
      raid: P.raid(this.id), rprv: this.acc("rprv"), rpub: this.acc("rpub"), district: P.slot("district", this.id, district), raidKey: this.raidKey.publicKey,
    }).instruction();
  }
  finishTradeIx() {
    return this.m.finishTrade(this.slot).accountsPartial({
      raid: P.raid(this.id), rprv: this.acc("rprv"), rpub: this.acc("rpub"),
      district0: P.slot("district", this.id, 0), district1: P.slot("district", this.id, 1), district2: P.slot("district", this.id, 2), raidKey: this.raidKey.publicKey,
    }).instruction();
  }
  cancelTradeIx() {
    return this.m.cancelTrade(this.slot).accountsPartial({ raid: P.raid(this.id), rprv: this.acc("rprv"), rpub: this.acc("rpub"), raidKey: this.raidKey.publicKey }).instruction();
  }
  startExtractIx(exit: number) {
    return this.m.startExtract(this.slot, exit).accountsPartial({ raid: P.raid(this.id), rprv: this.acc("rprv"), raidKey: this.raidKey.publicKey }).instruction();
  }
  finishExtractIx() {
    return this.m.finishExtract(this.slot).accountsPartial({ raid: P.raid(this.id), rprv: this.acc("rprv"), rpub: this.acc("rpub"), raidKey: this.raidKey.publicKey }).instruction();
  }
}

// ---------------- lobby (wallet signs on the base layer) ----------------
/** faucet_dusd (if the wallet holds < 10 dUSD) + join_raid(slot, raid key, class). */
export async function buildJoinTx(wallet: PublicKey, id: string, slot: number, raidKey: PublicKey, cls = 0): Promise<Transaction> {
  const prog = coderProgram;
  const ata = walletAta(wallet);
  const bal = await base.getTokenAccountBalance(ata).then((b) => Number(b.value.amount)).catch(() => 0);
  const tx = new Transaction();
  if (bal < STAKE) {
    tx.add(await prog.methods.faucetDusd(new anchor.BN(STAKE)).accountsPartial({
      config: P.config(), ledger: P.faucet(wallet), mintAuth: P.mintAuth(), mint: DUSD, userAta: ata, user: wallet,
      tokenProgram: TOKEN, associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
    }).instruction());
  }
  tx.add(await prog.methods.joinRaid(slot, raidKey, cls).accountsPartial({
    config: P.config(), raid: P.raid(id), rpub: P.slot("rpub", id, slot), rprv: P.slot("rprv", id, slot), walletAta: ata,
    escrowAuth: P.escrowAuth(id), escrow: escrowAta(id), dusdMint: DUSD, wallet, keeper: null as unknown as PublicKey, tokenProgram: TOKEN,
  }).instruction());
  tx.feePayer = wallet;
  tx.recentBlockhash = (await base.getLatestBlockhash()).blockhash;
  return tx;
}

// ---------------- Extraction Market (spectators, dPLAY play-money; keeper/src/bets.ts) ----------------
export const PLAY = new PublicKey(devnet.mints.play);
export const MEMO_PROGRAM = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
export async function playBalance(wallet: PublicKey) {
  return base.getTokenAccountBalance(walletAta(wallet, PLAY)).then((b) => Number(b.value.amount)).catch(() => 0);
}
/** RAZKYN LIVE pick: same transfer + memo razkyn-pick:<raid>:<C|D>:<window>:<choice> (keeper/src/picks.ts). */
export async function buildPickTx(wallet: PublicKey, raidId: string, type: "C" | "D", window: number, choice: number, amount: number, keeperAta: PublicKey): Promise<Transaction> {
  const tx = await buildBetTx(wallet, raidId, 0, "Y", amount, keeperAta);
  const memoIx = tx.instructions.findIndex((ix) => ix.programId.equals(MEMO_PROGRAM));
  tx.instructions[memoIx] = new TransactionInstruction({ programId: MEMO_PROGRAM, keys: [{ pubkey: wallet, isSigner: true, isWritable: false }], data: Buffer.from(`razkyn-pick:${raidId}:${type}:${window}:${choice}`, "utf8") });
  return tx;
}
/** One bet = free dPLAY from the faucet if needed + a dPLAY transfer to the keeper + a memo naming raid, raider and side. */
export async function buildBetTx(wallet: PublicKey, raidId: string, slot: number, side: "Y" | "N", amount: number, keeperAta: PublicKey): Promise<Transaction> {
  const ata = walletAta(wallet, PLAY);
  const tx = new Transaction();
  if ((await playBalance(wallet)) < amount) {
    tx.add(await coderProgram.methods.faucetPlay(new anchor.BN(Math.max(100, amount))).accountsPartial({
      config: P.config(), ledger: P.faucet(wallet), mintAuth: P.mintAuth(), mint: PLAY, userAta: ata, user: wallet,
      tokenProgram: TOKEN, associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
    }).instruction());
  }
  tx.add(createTransferCheckedInstruction(ata, PLAY, keeperAta, wallet, BigInt(amount), 0, [], TOKEN));
  tx.add(new TransactionInstruction({ programId: MEMO_PROGRAM, keys: [{ pubkey: wallet, isSigner: true, isWritable: false }], data: Buffer.from(`razkyn-bet:${raidId}:${slot}:${side}`, "utf8") }));
  tx.feePayer = wallet;
  tx.recentBlockhash = (await base.getLatestBlockhash()).blockhash;
  return tx;
}

export async function dusdBalance(wallet: PublicKey) {
  return base.getTokenAccountBalance(walletAta(wallet)).then((b) => Number(b.value.amount)).catch(() => 0);
}

// ---------------- geometry (constants.rs) ----------------
export const MAP_W = 64, MAP_H = 40, UNIT = 100;
export const DISTRICT_TILES: [number, number][] = [[0, 20], [22, 42], [44, 63]];
export const DISTRICTS = ["Tower", "Factory", "Harbor"];
/** District names per raid mode (0 Mystery, 1 Live crypto, 2 Live Markets: NVDA, TSLA, SOL). */
export const districtNames = (mode: number | undefined) => (mode === 2 ? ["NVDA Tower", "TSLA Factory", "SOL Harbor"] : DISTRICTS);
export const MODE_TRACKS: Record<number, string[]> = { 1: ["SOL", "BTC", "ETH"], 2: ["NVDA", "TSLA", "SOL"] };
/** Raider classes (constants.rs CLASS_*). */
export const CLASSES = [
  { name: "Raider", tag: "RAIDER", perk: "Balanced. No perk, no weakness." },
  { name: "Scout", tag: "SCOUT", perk: "Sees 10 tiles through the fog instead of 8." },
  { name: "Trader", tag: "TRADER", perk: "Trades in 2 s instead of 3: less time exposed." },
  { name: "Gunner", tag: "GUNNER", perk: "Range 7 tiles and shoots every 400 ms." },
] as const;
export const visionTiles = (cls: number | undefined) => (cls === 1 ? 10 : 8);
export const rangeTiles = (cls: number | undefined) => (cls === 3 ? 7 : 6);
export const MARKET_EVENTS = ["", "TRADING HALT", "RATE SHOCK", "EARNINGS SURPRISE"];
export const EXITS: [number, number][] = [[1, 20], [32, 1], [32, 38], [62, 20]];
export const TERMINALS: [number, number][] = [[5, 12], [15, 28], [27, 12], [37, 28], [49, 12], [59, 28]];
export const HAZARD_ROWS: Record<number, [number, number]> = { 1: [16, 23], 2: [12, 27] };
export const VISION_TILES = 8;
export const SHOOT_RANGE_TILES = 6;
export const districtOfX = (xUnits: number) => DISTRICT_TILES.findIndex(([lo, hi]) => Math.floor(xUnits / UNIT) >= lo && Math.floor(xUnits / UNIT) <= hi);
export const changeBps = (d: DistrictAcc | null) => {
  const start = d ? Number(d.startPrice.toString()) : 0;
  return d && start > 0 ? Math.round(((Number(d.currentPrice.toString()) - start) / start) * 10_000) : 0; // 0 before the raid starts
};
/** Backpack value in dUSD base units at current district prices (units × index / 10^6). */
export const backpackValue = (bp: BN[] | undefined, ds: (DistrictAcc | null)[]) =>
  (bp ?? []).reduce((a, u, i) => a + (Number(u.toString()) * Number(ds[i]?.currentPrice.toString() ?? PRICE_ONE)) / PRICE_ONE, 0);

/** Base-layer settlement record ["settle", raid_id]: settled flag and how (1 = Magic Action finalize_raid, 2 = settle_stuck_raid recovery). */
export async function readSettlement(id: string) {
  return decode<{ settled: boolean; settledVia: number }>("settlement", (await base.getAccountInfo(P.settlement(id)))?.data);
}
