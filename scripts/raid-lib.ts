// Reusable devnet raid driver (base + devnet-tee): setup flow and gameplay helpers.
// Used by scripts/m2-devnet.ts now and by the keeper (M5) later.
// MagicBlock ids: vendor/ephemeral-rollups-sdk/ts/web3js/src/{constants.ts,pda.ts}; VRF queue:
// vendor/ephemeral-rollups-sdk/rust/vrf-sdk/src/consts.rs.
import * as anchor from "@coral-xyz/anchor";
import {
  ComputeBudgetProgram, Connection, Keypair, PublicKey, SystemProgram, SYSVAR_SLOT_HASHES_PUBKEY, Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import {
  EPHEMERAL_VAULT_ID, MAGIC_CONTEXT_ID, MAGIC_PROGRAM_ID, PERMISSION_PROGRAM_ID, permissionPdaFromAccount,
} from "@magicblock-labs/ephemeral-rollups-sdk";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { REPO, TEE_VALIDATOR, baseConn, loadKeypair, teeConn, sendBase, sendTee, sleep, waitVisible } from "./spike-lib.ts";

export const DEFAULT_EPHEMERAL_QUEUE = new PublicKey("5hBR571xnXppuCPveTrctfTU7tJLSN94nq7kv7FRK5Tc");
export const VRF_PROGRAM_ID = new PublicKey("Vrf1RNUjXmQGjmQrQLvJHs9SNkvDJEsRVFPkfSQUwGz");
export const NUM_CRATES = 36;
/** SOL/USD, BTC/USD, ETH/USD Pricing Oracle feeds (M0/S3, spikes/results/s3-oracle.json). */
export const LIVE_FEEDS = ["ENYwebBThHzmzwPLAQvCucUTsjyfBSZdD9ViXksS4jPu", "71wtTRDY8Gxgw56bXFt2oc6qeAbTxzStdNiC425Z51sr", "5vaYr1hpv8yrSpu8w3K95x22byYxUJCCNCSYJtqVWPvG"].map((k) => new PublicKey(k));
export const DROP_BASE = 36;
export const TOKEN = TOKEN_2022_PROGRAM_ID;
const STAKE = 10_000_000;

export const cfg = JSON.parse(readFileSync(join(REPO, "config", "devnet.json"), "utf8"));
export const idl = JSON.parse(readFileSync(join(REPO, "idl", "razkyn.json"), "utf8"));
export const PID = new PublicKey(idl.address);
export const DUSD = new PublicKey(cfg.mints.dusd);

export const programFor = (conn: Connection, payer: Keypair) =>
  new anchor.Program(idl, new anchor.AnchorProvider(conn, new anchor.Wallet(payer), { commitment: "confirmed" }));
const pda = (...seeds: (Buffer | Uint8Array)[]) => PublicKey.findProgramAddressSync(seeds, PID)[0];
const cu = (units: number) => ComputeBudgetProgram.setComputeUnitLimit({ units });

export type Raider = { wallet: Keypair; raidKey: Keypair; tee?: Connection; bot: boolean };

export class RaidSession {
  readonly keeper = loadKeypair("keeper");
  readonly base = baseConn();
  readonly P = programFor(this.base, this.keeper);
  teeK!: Connection;
  T!: anchor.Program;
  readonly idb: Buffer;
  readonly sigs: Record<string, string | string[]> = {};
  raiders: Raider[] = [];

  constructor(readonly raidId: anchor.BN, readonly mode: 0 | 1 = 1, readonly leafCount = 0, readonly dayRoot: number[] = Array(32).fill(0)) {
    this.idb = raidId.toArrayLike(Buffer, "le", 8);
  }

  // ---- PDAs ----
  get config() { return pda(Buffer.from("config")); }
  get mintAuth() { return pda(Buffer.from("mint_auth")); }
  get raid() { return pda(Buffer.from("raid"), this.idb); }
  get secret() { return pda(Buffer.from("secret"), this.idb); }
  get escrowAuth() { return pda(Buffer.from("escrow"), this.idb); }
  get escrow() { return getAssociatedTokenAddressSync(DUSD, this.escrowAuth, true, TOKEN); }
  slot(seed: string, s: number) { return pda(Buffer.from(seed), this.idb, Buffer.from([s])); }
  crate(idx: number) { return this.slot("crate", idx); }
  district(i: number) { return this.slot("district", i); }

  // ---- base: lobby ----
  async createRaid(nSlots: number) {
    const P = this.P, k = this.keeper.publicKey;
    const create = await P.methods.createRaid(this.raidId, this.mode, this.leafCount, this.dayRoot, Array(32).fill(0)).accountsPartial({
      config: this.config, raid: this.raid, secret: this.secret, escrowAuth: this.escrowAuth, escrow: this.escrow,
      dusdMint: DUSD, keeper: k, tokenProgram: TOKEN, associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
    }).instruction();
    this.sigs.createRaid = await sendBase(this.base, [create], [this.keeper]);
    const slots = await Promise.all(Array.from({ length: nSlots }, (_, s) => P.methods.createSlot(s).accountsPartial({
      config: this.config, raid: this.raid, rpub: this.slot("rpub", s), rprv: this.slot("rprv", s), view: this.slot("view", s), keeper: k,
    }).instruction()));
    for (let i = 0; i < slots.length; i += 3) await sendBase(this.base, slots.slice(i, i + 3), [this.keeper]);
    const dist = await P.methods.createDistricts().accountsPartial({
      config: this.config, raid: this.raid, district0: this.district(0), district1: this.district(1), district2: this.district(2), keeper: k,
    }).instruction();
    await sendBase(this.base, [dist], [this.keeper]);
    await this.createSettlement();
    const total = NUM_CRATES + nSlots;
    const crateSigs: string[] = [];
    for (let first = 0; first < total; first += 12) {
      const count = Math.min(12, total - first);
      const ix = await P.methods.createCrates(first, count).accountsPartial({ config: this.config, raid: this.raid, keeper: k })
        .remainingAccounts(Array.from({ length: count }, (_, i) => ({ pubkey: this.crate(first + i), isSigner: false, isWritable: true })))
        .instruction();
      crateSigs.push(await sendBase(this.base, [cu(400_000), ix], [this.keeper]));
    }
    this.sigs.createCrates = crateSigs;
  }

  async join(slot: number, wallet: Keypair, bot = false) {
    const raidKey = Keypair.generate();
    if ((await this.base.getBalance(wallet.publicKey)) < 10_000_000) {
      await sendBase(this.base, [SystemProgram.transfer({ fromPubkey: this.keeper.publicKey, toPubkey: wallet.publicKey, lamports: 20_000_000 })], [this.keeper]);
    }
    const ata = getAssociatedTokenAddressSync(DUSD, wallet.publicKey, false, TOKEN);
    const bal = await this.base.getTokenAccountBalance(ata).then((b) => Number(b.value.amount)).catch(() => 0);
    const ixs: TransactionInstruction[] = [];
    if (bal < STAKE) {
      ixs.push(await this.P.methods.faucetDusd(new anchor.BN(STAKE)).accountsPartial({
        config: this.config, ledger: pda(Buffer.from("faucet"), wallet.publicKey.toBuffer()), mintAuth: this.mintAuth, mint: DUSD,
        userAta: ata, user: wallet.publicKey, tokenProgram: TOKEN, associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      }).instruction());
    }
    ixs.push(await this.P.methods.joinRaid(slot, raidKey.publicKey).accountsPartial({
      config: this.config, raid: this.raid, rpub: this.slot("rpub", slot), rprv: this.slot("rprv", slot),
      walletAta: ata, escrowAuth: this.escrowAuth, escrow: this.escrow, dusdMint: DUSD, wallet: wallet.publicKey,
      keeper: bot ? this.keeper.publicKey : null, tokenProgram: TOKEN,
    }).instruction());
    const signers = bot ? [wallet, this.keeper] : [wallet];
    this.sigs[`join_${slot}`] = await sendBase(this.base, ixs, signers);
    this.raiders[slot] = { wallet, raidKey, bot };
  }

  async delegateAll() {
    type Kind = Record<string, Record<string, number>>;
    const n = this.raiders.length;
    const targets: [PublicKey, Kind][] = [[this.secret, { secret: {} }]];
    for (const i of [0, 1, 2]) targets.push([this.district(i), { district: { index: i } }]);
    for (let s = 0; s < n; s++) {
      targets.push([this.slot("rpub", s), { raiderPublic: { slot: s } }]);
      targets.push([this.slot("rprv", s), { raiderPrivate: { slot: s } }]);
      targets.push([this.slot("view", s), { view: { slot: s } }]);
    }
    for (let idx = 0; idx < NUM_CRATES + n; idx++) targets.push([this.crate(idx), { crate: { idx } }]);
    targets.push([this.results, { results: {} }]);
    targets.push([this.raid, { raid: {} }]);
    const sigs: string[] = [];
    for (let i = 0; i < targets.length; i += 3) {
      const ixs: TransactionInstruction[] = [];
      for (const [t, kind] of targets.slice(i, i + 3)) {
        ixs.push(await this.P.methods.delegatePda(this.raidId, kind as never).accountsPartial({
          config: this.config, pda: t, keeper: this.keeper.publicKey, validator: TEE_VALIDATOR,
        }).instruction());
      }
      sigs.push(await sendBase(this.base, ixs, [this.keeper]));
    }
    this.sigs.delegate = sigs;
    return targets.map(([t]) => t);
  }

  // ---- TEE: setup ----
  async connectTee() {
    this.teeK = await teeConn(this.keeper);
    this.T = programFor(this.teeK, this.keeper);
  }

  async teeSetup(delegated: PublicKey[]) {
    const T = this.T, k = this.keeper.publicKey;
    for (const t of delegated) await waitVisible(this.teeK, t, 60_000).catch(() => null);
    const common = { keeper: k, permissionProgram: PERMISSION_PROGRAM_ID, ephemeralVault: EPHEMERAL_VAULT_ID, magicProgram: MAGIC_PROGRAM_ID };
    for (let s = 0; s < this.raiders.length; s++) {
      const rprv = this.slot("rprv", s), view = this.slot("view", s);
      const ix = await T.methods.setupSlotPermissions(s).accountsPartial({
        raid: this.raid, rprv, view, rprvPermission: permissionPdaFromAccount(rprv), viewPermission: permissionPdaFromAccount(view), ...common,
      }).instruction();
      this.sigs[`permissions_${s}`] = (await sendTee(this.teeK, [ix], [this.keeper])).sig;
    }
    this.sigs.secretPermission = (await sendTee(this.teeK, [await T.methods.setupSecretPermission().accountsPartial({
      raid: this.raid, secret: this.secret, secretPermission: permissionPdaFromAccount(this.secret), ...common,
    }).instruction()], [this.keeper])).sig;
  }

  async readRaid() {
    return (await this.T.account.raid.fetch(this.raid)) as unknown as { status: number; tickNo: anchor.BN; startTs: anchor.BN; cratesPlaced: anchor.BN };
  }

  /** Request VRF; re-request after 35 s if the callback has not arrived (program allows after 30 s). */
  async seed(): Promise<number> {
    const ix = () => this.T.methods.requestRaidVrf().accountsPartial({
      keeper: this.keeper.publicKey, raid: this.raid, oracleQueue: DEFAULT_EPHEMERAL_QUEUE,
      programIdentity: PublicKey.findProgramAddressSync([Buffer.from("identity")], PID)[0],
      vrfProgram: VRF_PROGRAM_ID, slotHashes: SYSVAR_SLOT_HASHES_PUBKEY,
    }).instruction();
    const reqs: string[] = [(await sendTee(this.teeK, [await ix()], [this.keeper])).sig];
    const t0 = Date.now();
    for (let attempt = 0; attempt < 3; attempt++) {
      while (Date.now() - t0 < (attempt + 1) * 35_000) {
        if ((await this.readRaid()).status === 1) { this.sigs.vrfRequests = reqs; return Date.now() - t0; }
        await sleep(300);
      }
      if (attempt < 2) reqs.push((await sendTee(this.teeK, [await ix()], [this.keeper])).sig);
    }
    throw new Error("VRF callback did not arrive");
  }

  async placeCrates() {
    const sigs: string[] = [];
    for (let first = 0; first < NUM_CRATES; first += 6) {
      const rem = [];
      for (let idx = first; idx < first + 6; idx++) {
        rem.push({ pubkey: this.crate(idx), isSigner: false, isWritable: true });
        rem.push({ pubkey: permissionPdaFromAccount(this.crate(idx)), isSigner: false, isWritable: true });
      }
      const ix = await this.T.methods.placeCrates(first, 6).accountsPartial({
        raid: this.raid, secret: this.secret, keeper: this.keeper.publicKey,
        permissionProgram: PERMISSION_PROGRAM_ID, ephemeralVault: EPHEMERAL_VAULT_ID, magicProgram: MAGIC_PROGRAM_ID,
      }).remainingAccounts(rem).instruction();
      sigs.push((await sendTee(this.teeK, [cu(1_000_000), ix], [this.keeper])).sig);
    }
    this.sigs.placeCrates = sigs;
  }

  /** Mystery: the VRF-chosen leaf index, read from RaidSecret as the keeper (a member).
   *  Raw offset of RaidSecret.leaf_index: 8 disc + 8 raid_id + 32 seed + 32 slice_hash. */
  async leafIndex(): Promise<number> {
    const info = await this.teeK.getAccountInfo(this.secret);
    return info!.data.readUInt32LE(80);
  }

  /** Mystery: upload the chosen day's slice (5 × 720 B) and verify it against day_root. */
  async loadAndVerify(day: { day: string; sliceStart: number; headlinesHash: string; proof: string[] }, steps: number[]) {
    const bytes = Buffer.from(new Uint32Array(steps).buffer);
    const sigs: string[] = [];
    for (let c = 0; c < 5; c++) {
      const ix = await this.T.methods.loadSlice(c, bytes.subarray(c * 720, (c + 1) * 720)).accountsPartial({
        raid: this.raid, secret: this.secret, keeper: this.keeper.publicKey,
      }).instruction();
      sigs.push((await sendTee(this.teeK, [ix], [this.keeper])).sig);
    }
    this.sigs.loadSlice = sigs;
    const ix = await this.T.methods.verifySlice(
      Array.from(Buffer.from(day.day, "ascii")), day.sliceStart, Array.from(Buffer.from(day.headlinesHash, "hex")),
      day.proof.map((p) => Array.from(Buffer.from(p, "hex"))),
    ).accountsPartial({ raid: this.raid, secret: this.secret, keeper: this.keeper.publicKey }).instruction();
    this.sigs.verifySlice = (await sendTee(this.teeK, [cu(400_000), ix], [this.keeper])).sig;
  }

  async start() {
    this.sigs.startRaid = (await sendTee(this.teeK, [await this.T.methods.startRaid().accountsPartial({ raid: this.raid, secret: this.secret, keeper: this.keeper.publicKey }).instruction()], [this.keeper])).sig;
    for (const r of this.raiders) r.tee = await teeConn(r.raidKey);
  }

  async districtAcc(i: number) {
    return (await this.T.account.district.fetch(this.district(i))) as unknown as { startPrice: anchor.BN; currentPrice: anchor.BN; startRaw: anchor.BN; hazardLevel: number; awake: boolean; histLen: number };
  }

  /** Keeper fast send (preflight on, no confirmation poll), used for ticks. */
  private kbh: { hash: string; at: number } | null = null;
  async keeperFast(ixs: TransactionInstruction[]): Promise<string> {
    if (!this.kbh || Date.now() - this.kbh.at > 1500) this.kbh = { hash: (await this.teeK.getLatestBlockhash()).blockhash, at: Date.now() };
    const tx = new Transaction().add(cu(400_000 + (this.knonce++ % 1000)), ...ixs);
    tx.feePayer = this.keeper.publicKey;
    tx.recentBlockhash = this.kbh.hash;
    tx.sign(this.keeper);
    return this.teeK.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 0 });
  }
  private knonce = 0;

  // ---- TEE: gameplay ----
  async tickIxs() {
    const d = { district0: this.district(0), district1: this.district(1), district2: this.district(2) };
    // Live mode passes the three Pricing Oracle feeds (programs/razkyn/src/constants.rs LIVE_FEEDS).
    const feeds = this.mode === 1 ? { feed0: LIVE_FEEDS[0], feed1: LIVE_FEEDS[1], feed2: LIVE_FEEDS[2] } : { feed0: null, feed1: null, feed2: null };
    const tick = await this.T.methods.tick().accountsPartial({ raid: this.raid, secret: this.secret, ...d, ...feeds }).instruction();
    const fog = await this.T.methods.tickRaiders().accountsPartial({ raid: this.raid, ...d }).remainingAccounts(
      this.raiders.flatMap((_, s) => [
        { pubkey: this.slot("rprv", s), isSigner: false, isWritable: false },
        { pubkey: this.slot("view", s), isSigner: false, isWritable: true },
        { pubkey: this.slot("rpub", s), isSigner: false, isWritable: true },
      ]),
    ).instruction();
    return [tick, fog];
  }

  async asRaider(slot: number, ix: TransactionInstruction) {
    const r = this.raiders[slot];
    return sendTee(r.tee!, [ix], [r.raidKey]);
  }

  /** Keeper-side read of a raider's private state (the keeper is a permission member). */
  async rprv(slot: number) {
    const info = await this.teeK.getAccountInfo(this.slot("rprv", slot));
    return this.T.coder.accounts.decode("raiderPrivate", info!.data) as { x: number; y: number; backpack: anchor.BN[] };
  }
  async rpub(slot: number) {
    return (await this.T.account.raiderPublic.fetch(this.slot("rpub", slot))) as unknown as { hp: number; alive: boolean; exposed: boolean; pubX: number; pubY: number; kills: number };
  }
  async crateAcc(idx: number) {
    const info = await this.teeK.getAccountInfo(this.crate(idx));
    return this.T.coder.accounts.decode("crate", info!.data) as { x: number; y: number; dormant: boolean; state: number; district: number; units: anchor.BN[]; openedUnits: anchor.BN[] };
  }

  async move(slot: number, dx: number, dy: number) {
    const ix = await this.T.methods.moveTo(slot, dx, dy).accountsPartial({ raid: this.raid, rprv: this.slot("rprv", slot), raidKey: this.raiders[slot].raidKey.publicKey }).instruction();
    return this.asRaider(slot, ix);
  }

  /**
   * Fast gameplay send, as measured in M0/S2: preflight ON (on the ER it executes the tx and
   * returns its error), no confirmation poll, cached blockhash. ~1 RTT per tx instead of ~4-5 s.
   * A varying CU limit keeps otherwise-identical txs unique.
   */
  private bh: { hash: string; at: number } | null = null;
  private nonce = 0;
  async sendFast(slot: number, ix: TransactionInstruction): Promise<string> {
    const r = this.raiders[slot];
    if (!this.bh || Date.now() - this.bh.at > 1500) {
      this.bh = { hash: (await r.tee!.getLatestBlockhash()).blockhash, at: Date.now() };
    }
    const tx = new Transaction().add(cu(200_000 + (this.nonce++ % 1000)), ix);
    tx.feePayer = r.raidKey.publicKey;
    tx.recentBlockhash = this.bh.hash;
    tx.sign(r.raidKey);
    return r.tee!.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 0 });
  }

  /** Walk at legal speed (≤ 55 units per move; each send is ≥ 1 RTT ≈ 40+ slots apart),
   *  dead-reckoning between moves and re-reading the true position at the end. */
  async walkTo(slot: number, x: number, y: number, within: number) {
    let moves = 0;
    let me = await this.rprv(slot);
    for (let round = 0; round < 5; round++) {
      let cx = me.x, cy = me.y;
      for (;;) {
        const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy);
        if (d <= within) break;
        const step = Math.min(55, d);
        const sx = Math.round((dx * step) / d), sy = Math.round((dy * step) / d);
        const ix = await this.T.methods.moveTo(slot, sx, sy).accountsPartial({ raid: this.raid, rprv: this.slot("rprv", slot), raidKey: this.raiders[slot].raidKey.publicKey }).instruction();
        await this.sendFast(slot, ix);
        cx += sx; cy += sy; moves++;
      }
      me = await this.rprv(slot);
      if (Math.hypot(x - me.x, y - me.y) <= within) return moves;
    }
    throw new Error(`walkTo(${slot}) did not arrive`);
  }

  async open(slot: number, idx: number) {
    return this.asRaider(slot, await this.openIx(slot, idx));
  }
  async openIx(slot: number, idx: number) {
    const c = await this.crateAcc(idx);
    return this.T.methods.openCrate(slot, idx).accountsPartial({
      raid: this.raid, rprv: this.slot("rprv", slot), crateAcc: this.crate(idx), district: this.district(c.district),
      raidKey: this.raiders[slot].raidKey.publicKey,
    }).instruction();
  }
  async finishOpen(slot: number, idx: number) {
    return this.asRaider(slot, await this.finishOpenIx(slot, idx));
  }
  async finishOpenIx(slot: number, idx: number) {
    return this.T.methods.finishOpen(slot, idx).accountsPartial({
      raid: this.raid, rprv: this.slot("rprv", slot), crateAcc: this.crate(idx),
      cratePermission: idx < NUM_CRATES ? permissionPdaFromAccount(this.crate(idx)) : null, // drop crates have none
      raidKey: this.raiders[slot].raidKey.publicKey, permissionProgram: PERMISSION_PROGRAM_ID, ephemeralVault: EPHEMERAL_VAULT_ID, magicProgram: MAGIC_PROGRAM_ID,
    }).instruction();
  }
  async shoot(slot: number, target: number) {
    return this.asRaider(slot, await this.shootIx(slot, target));
  }
  async shootIx(slot: number, target: number) {
    return this.T.methods.shoot(slot, target).accountsPartial({
      raid: this.raid, shooterPrv: this.slot("rprv", slot), shooterPub: this.slot("rpub", slot),
      targetPrv: this.slot("rprv", target), targetPub: this.slot("rpub", target), dropCrate: this.crate(DROP_BASE + target),
      raidKey: this.raiders[slot].raidKey.publicKey,
    }).instruction();
  }

  // ---- M4: extraction + settlement ----
  get results() { return pda(Buffer.from("results"), this.idb); }
  get settlement() { return pda(Buffer.from("settle"), this.idb); }
  get reserveAuth() { return pda(Buffer.from("reserve"), this.idb); }
  get testFlags() { return pda(Buffer.from("test_flags")); }

  async createSettlement() {
    const ix = await this.P.methods.createSettlement().accountsPartial({
      config: this.config, raid: this.raid, results: this.results, settlement: this.settlement, reserveAuth: this.reserveAuth,
      reserve: getAssociatedTokenAddressSync(DUSD, this.reserveAuth, true, TOKEN), treasuryOwner: this.keeper.publicKey,
      treasury: getAssociatedTokenAddressSync(DUSD, this.keeper.publicKey, false, TOKEN), dusdMint: DUSD, keeper: this.keeper.publicKey,
      tokenProgram: TOKEN, associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
    }).instruction();
    this.sigs.createSettlement = await sendBase(this.base, [ix], [this.keeper]);
  }

  /** Extraction uses the fast send (exit windows are only 30 s). Returns { sig }. */
  async startExtract(slot: number, exit: number) {
    const ix = await this.T.methods.startExtract(slot, exit).accountsPartial({ raid: this.raid, rprv: this.slot("rprv", slot), raidKey: this.raiders[slot].raidKey.publicKey }).instruction();
    return { sig: await this.sendFast(slot, ix) };
  }
  async finishExtract(slot: number) {
    const ix = await this.T.methods.finishExtract(slot).accountsPartial({ raid: this.raid, rprv: this.slot("rprv", slot), rpub: this.slot("rpub", slot), raidKey: this.raiders[slot].raidKey.publicKey }).instruction();
    return { sig: await this.sendFast(slot, ix) };
  }

  /** end_raid (anyone; here the keeper pays): Results + commit/undelegate + finalize_raid action. */
  async endRaid() {
    const ix = await this.T.methods.endRaid().accountsPartial({
      payer: this.keeper.publicKey, raid: this.raid, results: this.results, config: this.config,
      district0: this.district(0), district1: this.district(1), district2: this.district(2), programId: PID,
      magicContext: MAGIC_CONTEXT_ID, magicProgram: MAGIC_PROGRAM_ID,
    }).remainingAccounts(this.raiders.map((_, s) => ({ pubkey: this.slot("rprv", s), isSigner: false, isWritable: false }))).instruction();
    const r = await sendTee(this.teeK, [cu(1_400_000), ix], [this.keeper]);
    this.sigs.endRaid = r.sig;
    return r.sig;
  }

  settleAccounts() {
    return {
      settlement: this.settlement, raid: this.raid, results: this.results, config: this.config, testFlags: this.testFlags,
      vaultAuth: this.escrowAuth, stakeVault: this.escrow, treasury: getAssociatedTokenAddressSync(DUSD, this.keeper.publicKey, false, TOKEN),
      reserve: getAssociatedTokenAddressSync(DUSD, this.reserveAuth, true, TOKEN), dusdMint: DUSD, tokenProgram: TOKEN,
    };
  }

  async settleStuck(payer: Keypair) {
    const ix = await this.P.methods.settleStuckRaid().accountsPartial({ settle: this.settleAccounts(), payer: payer.publicKey } as never).instruction();
    return sendBase(this.base, [ix], [payer]);
  }

  async claim(slot: number, payer: Keypair) {
    const wallet = this.raiders[slot].wallet.publicKey;
    const m = [cfg.mints.twr, cfg.mints.fac, cfg.mints.hrb].map((k: string) => new PublicKey(k));
    const ix = await this.P.methods.claim(slot).accountsPartial({
      settlement: this.settlement, results: this.results, claimRecord: pda(Buffer.from("claim"), this.idb, Buffer.from([slot])), wallet,
      config: this.config, vaultAuth: this.escrowAuth, stakeVault: this.escrow, walletDusd: getAssociatedTokenAddressSync(DUSD, wallet, false, TOKEN),
      mintAuth: this.mintAuth, twrMint: m[0], facMint: m[1], hrbMint: m[2],
      walletTwr: getAssociatedTokenAddressSync(m[0], wallet, false, TOKEN), walletFac: getAssociatedTokenAddressSync(m[1], wallet, false, TOKEN),
      walletHrb: getAssociatedTokenAddressSync(m[2], wallet, false, TOKEN), dusdMint: DUSD, payer: payer.publicKey,
      tokenProgram: TOKEN, associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
    }).instruction();
    return sendBase(this.base, [cu(600_000), ix], [payer]);
  }

  async readSettlement() {
    return (await this.P.account.settlement.fetch(this.settlement)) as unknown as { settled: boolean; settledVia: number; dusdPaid: anchor.BN; claims: number; resultsHash: number[] };
  }
  async readResultsBase() {
    const info = await this.base.getAccountInfo(this.results);
    return info ? { owner: info.owner.toBase58(), data: this.P.coder.accounts.decode("results", info.data) as { computed: boolean; stakesTotal: anchor.BN; ops: anchor.BN; reserveTotal: anchor.BN; dusdTotal: anchor.BN; scaled: boolean; leftover: anchor.BN; finalPrices: anchor.BN[]; raiders: { dusdPayout: anchor.BN; mintUnits: anchor.BN[]; extracted: boolean; joined: boolean }[] } } : null;
  }
}

/** Admin-only test flag for devnet test 11 (finalize_raid forced to fail). */
export async function setTestFlags(failFinalize: boolean) {
  const keeper = loadKeypair("keeper"); // admin == keeper on devnet (M1 init_config)
  const base = baseConn();
  const P = programFor(base, keeper);
  const ix = await P.methods.setTestFlags(failFinalize).accountsPartial({
    testFlags: pda(Buffer.from("test_flags")), config: pda(Buffer.from("config")), admin: keeper.publicKey,
  }).instruction();
  return sendBase(base, [ix], [keeper]);
}
