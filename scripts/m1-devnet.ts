// M1 devnet evidence: the whole M1 path on devnet + devnet-tee with two raiders.
// Prereqs: program deployed (scripts/deploy.sh), mints created (scripts/setup-mints.ts).
// usage: tsx scripts/m1-devnet.ts
import * as anchor from "@coral-xyz/anchor";
import {
  Connection, Keypair, PublicKey, SystemProgram, SYSVAR_SLOT_HASHES_PUBKEY, Transaction, TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import {
  EPHEMERAL_VAULT_ID, MAGIC_PROGRAM_ID, PERMISSION_PROGRAM_ID, permissionPdaFromAccount,
} from "@magicblock-labs/ephemeral-rollups-sdk";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  BASE_RPC, TEE_RPC, TEE_VALIDATOR, REPO, baseConn, baseTx, loadKeypair, teeConn, sendBase, sendTee,
  routerStatus, saveEvidence, sleep, waitVisible,
} from "./spike-lib.ts";

const DEFAULT_EPHEMERAL_QUEUE = new PublicKey("5hBR571xnXppuCPveTrctfTU7tJLSN94nq7kv7FRK5Tc"); // vrf-sdk/src/consts.rs
const VRF_PROGRAM_ID = new PublicKey("Vrf1RNUjXmQGjmQrQLvJHs9SNkvDJEsRVFPkfSQUwGz");
const STAKE = 10_000_000n;

const cfg = JSON.parse(readFileSync(join(REPO, "config", "devnet.json"), "utf8"));
const idl = JSON.parse(readFileSync(join(REPO, "idl", "razkyn.json"), "utf8"));
const PID = new PublicKey(idl.address);
const DUSD = new PublicKey(cfg.mints.dusd);
const TOKEN = TOKEN_2022_PROGRAM_ID;
const ev: Record<string, unknown> = { when: new Date().toISOString(), programId: PID.toBase58() };
const sigs: Record<string, string> = {};

const keeper = loadKeypair("keeper");
const base = baseConn();
const programFor = (conn: Connection, payer: Keypair) =>
  new anchor.Program(idl, new anchor.AnchorProvider(conn, new anchor.Wallet(payer), { commitment: "confirmed" }));
const P = programFor(base, keeper);
const pda = (...seeds: (Buffer | Uint8Array)[]) => PublicKey.findProgramAddressSync(seeds, PID)[0];
const raidId = new anchor.BN(Date.now());
const idb = raidId.toArrayLike(Buffer, "le", 8);
const A = {
  config: pda(Buffer.from("config")),
  mintAuth: pda(Buffer.from("mint_auth")),
  raid: pda(Buffer.from("raid"), idb),
  secret: pda(Buffer.from("secret"), idb),
  escrowAuth: pda(Buffer.from("escrow"), idb),
  slot: (seed: string, s: number) => pda(Buffer.from(seed), idb, Buffer.from([s])),
};
const escrow = getAssociatedTokenAddressSync(DUSD, A.escrowAuth, true, TOKEN);

// ---------- config ----------
if (!(await base.getAccountInfo(A.config))) {
  const ix = await P.methods.initConfig(keeper.publicKey, keeper.publicKey).accountsPartial({
    config: A.config, mintAuth: A.mintAuth, dusdMint: DUSD, twrMint: new PublicKey(cfg.mints.twr),
    facMint: new PublicKey(cfg.mints.fac), hrbMint: new PublicKey(cfg.mints.hrb), playMint: new PublicKey(cfg.mints.play),
    admin: keeper.publicKey, tokenProgram: TOKEN,
  }).instruction();
  sigs.initConfig = await sendBase(base, [ix], [keeper]);
  console.log("init_config", sigs.initConfig);
}

// ---------- raiders: fund, faucet ----------
const raiders = [loadKeypair("playerA"), loadKeypair("playerB")].map((wallet) => ({ wallet, raidKey: Keypair.generate() }));
ev.raiders = raiders.map((r) => ({ wallet: r.wallet.publicKey.toBase58(), raidKey: r.raidKey.publicKey.toBase58() }));
for (const r of raiders) {
  if ((await base.getBalance(r.wallet.publicKey)) < 10_000_000) {
    await sendBase(base, [SystemProgram.transfer({ fromPubkey: keeper.publicKey, toPubkey: r.wallet.publicKey, lamports: 20_000_000 })], [keeper]);
  }
  const ix = await P.methods.faucetDusd(new anchor.BN(STAKE.toString())).accountsPartial({
    config: A.config, ledger: pda(Buffer.from("faucet"), r.wallet.publicKey.toBuffer()), mintAuth: A.mintAuth, mint: DUSD,
    userAta: getAssociatedTokenAddressSync(DUSD, r.wallet.publicKey, false, TOKEN), user: r.wallet.publicKey,
    tokenProgram: TOKEN, associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
  }).instruction();
  sigs[`faucet_${r.wallet.publicKey.toBase58().slice(0, 4)}`] = await sendBase(base, [ix], [r.wallet]);
}

// ---------- create raid (Live mode for M1: no slice yet) ----------
const createIx = await P.methods.createRaid(raidId, 1, 0, Array(32).fill(0), Array(32).fill(0)).accountsPartial({
  config: A.config, raid: A.raid, secret: A.secret, escrowAuth: A.escrowAuth, escrow, dusdMint: DUSD, keeper: keeper.publicKey,
  tokenProgram: TOKEN, associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
}).instruction();
const slotIxs = await Promise.all([0, 1].map((s) => P.methods.createSlot(s).accountsPartial({
  config: A.config, raid: A.raid, rpub: A.slot("rpub", s), rprv: A.slot("rprv", s), view: A.slot("view", s), keeper: keeper.publicKey,
}).instruction()));
const distIx = await P.methods.createDistricts().accountsPartial({
  config: A.config, raid: A.raid, district0: A.slot("district", 0), district1: A.slot("district", 1), district2: A.slot("district", 2), keeper: keeper.publicKey,
}).instruction();
sigs.createRaid = await sendBase(base, [createIx], [keeper]);
sigs.createSlots = await sendBase(base, slotIxs, [keeper]);
sigs.createDistricts = await sendBase(base, [distIx], [keeper]);
console.log("raid", raidId.toString(), A.raid.toBase58(), baseTx(sigs.createRaid));

for (const [s, r] of raiders.entries()) {
  const ix = await P.methods.joinRaid(s, r.raidKey.publicKey).accountsPartial({
    config: A.config, raid: A.raid, rpub: A.slot("rpub", s), rprv: A.slot("rprv", s),
    walletAta: getAssociatedTokenAddressSync(DUSD, r.wallet.publicKey, false, TOKEN), escrowAuth: A.escrowAuth, escrow,
    dusdMint: DUSD, wallet: r.wallet.publicKey, keeper: null, tokenProgram: TOKEN,
  }).instruction();
  sigs[`join_${s}`] = await sendBase(base, [ix], [r.wallet]);
}
const esc = await base.getTokenAccountBalance(escrow);
ev.escrowAfterJoins = esc.value.amount;

// ---------- delegate (escrow stays on base) ----------
type Kind = Record<string, Record<string, number>>;
const targets: [PublicKey, Kind][] = [[A.secret, { secret: {} }]];
for (const i of [0, 1, 2]) targets.push([A.slot("district", i), { district: { index: i } }]);
for (const s of [0, 1]) {
  targets.push([A.slot("rpub", s), { raiderPublic: { slot: s } }]);
  targets.push([A.slot("rprv", s), { raiderPrivate: { slot: s } }]);
  targets.push([A.slot("view", s), { view: { slot: s } }]);
}
targets.push([A.raid, { raid: {} }]);
const delSigs: string[] = [];
for (let i = 0; i < targets.length; i += 3) {
  const ixs: TransactionInstruction[] = [];
  for (const [t, kind] of targets.slice(i, i + 3)) {
    ixs.push(await P.methods.delegatePda(raidId, kind as never).accountsPartial({
      config: A.config, pda: t, keeper: keeper.publicKey, validator: TEE_VALIDATOR,
    }).instruction());
  }
  delSigs.push(await sendBase(base, ixs, [keeper]));
}
sigs.delegate = delSigs[0];
ev.delegateSigs = delSigs;
ev.raidRouterStatus = await routerStatus(A.raid);

// ---------- TEE setup ----------
const teeK = await teeConn(keeper);
const T = programFor(teeK, keeper);
for (const [t] of targets) await waitVisible(teeK, t, 60_000).catch(() => null);
for (const s of [0, 1]) {
  const rprv = A.slot("rprv", s), view = A.slot("view", s);
  const ix = await T.methods.setupSlotPermissions(s).accountsPartial({
    raid: A.raid, rprv, view, rprvPermission: permissionPdaFromAccount(rprv), viewPermission: permissionPdaFromAccount(view),
    keeper: keeper.publicKey, permissionProgram: PERMISSION_PROGRAM_ID, ephemeralVault: EPHEMERAL_VAULT_ID, magicProgram: MAGIC_PROGRAM_ID,
  }).instruction();
  sigs[`permissions_${s}`] = (await sendTee(teeK, [ix], [keeper])).sig;
}
sigs.secretPermission = (await sendTee(teeK, [await T.methods.setupSecretPermission().accountsPartial({
  raid: A.raid, secret: A.secret, secretPermission: permissionPdaFromAccount(A.secret), keeper: keeper.publicKey,
  permissionProgram: PERMISSION_PROGRAM_ID, ephemeralVault: EPHEMERAL_VAULT_ID, magicProgram: MAGIC_PROGRAM_ID,
}).instruction()], [keeper])).sig;

type RaidAcc = { status: number; tickNo: anchor.BN; vrfNonce: number };
const readRaid = async () => (await T.account.raid.fetch(A.raid)) as unknown as RaidAcc;
const vrfIx = async () => T.methods.requestRaidVrf().accountsPartial({
  keeper: keeper.publicKey, raid: A.raid, oracleQueue: DEFAULT_EPHEMERAL_QUEUE,
  programIdentity: PublicKey.findProgramAddressSync([Buffer.from("identity")], PID)[0],
  vrfProgram: VRF_PROGRAM_ID, slotHashes: SYSVAR_SLOT_HASHES_PUBKEY,
}).instruction();
sigs.vrfRequest = (await sendTee(teeK, [await vrfIx()], [keeper])).sig;
const vrfT0 = Date.now();
let seeded = false;
for (let attempt = 0; attempt < 3 && !seeded; attempt++) {
  while (Date.now() - vrfT0 < (attempt + 1) * 35_000) {
    if ((await readRaid()).status === 1) { seeded = true; break; }
    await sleep(300);
  }
  if (!seeded && attempt < 2) sigs[`vrfRetry_${attempt}`] = (await sendTee(teeK, [await vrfIx()], [keeper])).sig;
}
if (!seeded) throw new Error("VRF callback did not arrive");
ev.vrfSeededAfterMs = Date.now() - vrfT0;
const cbSigs = await teeK.getSignaturesForAddress(A.raid, { limit: 5 });
for (const s of cbSigs) {
  const t = await teeK.getTransaction(s.signature, { maxSupportedTransactionVersion: 0 });
  if (t?.meta?.logMessages?.some((l) => l.includes("VrfCallbackRaid")) && !t.meta.err) { sigs.vrfCallback = s.signature; break; }
}
sigs.startRaid = (await sendTee(teeK, [await T.methods.startRaid().accountsPartial({ raid: A.raid, keeper: keeper.publicKey }).instruction()], [keeper])).sig;

// ---------- ticks + fog ----------
const tickIx = await T.methods.tick().accountsPartial({ raid: A.raid, secret: A.secret }).instruction();
const fogIx = await T.methods.tickRaiders().accountsPartial({ raid: A.raid }).remainingAccounts(
  [0, 1].flatMap((s) => [
    { pubkey: A.slot("rprv", s), isSigner: false, isWritable: false },
    { pubkey: A.slot("view", s), isSigner: false, isWritable: true },
  ]),
).instruction();
const tickSigs: string[] = [];
for (let i = 0; i < 10; i++) {
  tickSigs.push((await sendTee(teeK, [tickIx, fogIx], [keeper])).sig);
}
ev.tickNoAfter10 = (await readRaid()).tickNo.toString();
sigs.tick = tickSigs[0];

// ---------- moves: legal, cheat, wrong signer ----------
const teeR = await Promise.all(raiders.map((r) => teeConn(r.raidKey)));
const moveIx = (slot: number, signer: PublicKey, dx: number, dy: number) =>
  T.methods.moveTo(slot, dx, dy).accountsPartial({ raid: A.raid, rprv: A.slot("rprv", slot), raidKey: signer }).instruction();
const decodeRprv = (data: Buffer) => T.coder.accounts.decode("raiderPrivate", data) as { x: number; y: number };
const p0 = decodeRprv((await teeR[0].getAccountInfo(A.slot("rprv", 0)))!.data);
const dir = p0.x > 3200 ? -1 : 1;
sigs.moveLegal = (await sendTee(teeR[0], [await moveIx(0, raiders[0].raidKey.publicKey, 60 * dir, 0)], [raiders[0].raidKey])).sig;
const p1 = decodeRprv((await teeR[0].getAccountInfo(A.slot("rprv", 0)))!.data);
async function expectFail(label: string, conn: Connection, ix: TransactionInstruction, signer: Keypair, code: string) {
  try {
    const s = (await sendTee(conn, [ix], [signer])).sig;
    return { label, rejected: false, sig: s };
  } catch (e) {
    const msg = String(e);
    return { label, rejected: true, expectedCode: code, matched: msg.includes(code), error: msg.slice(0, 240) };
  }
}
ev.cheats = [
  await expectFail("200-unit jump", teeR[0], await moveIx(0, raiders[0].raidKey.publicKey, 200 * dir, 0), raiders[0].raidKey, "0x177d"), // 6013 TooFast
  await expectFail("raider B's key moves slot 0", teeR[1], await moveIx(0, raiders[1].raidKey.publicKey, 10 * dir, 0), raiders[1].raidKey, "0x1779"), // 6009 WrongRaidKey
];
ev.positions = { spawn: p0, afterLegalMove: p1 };

// ---------- privacy reads on devnet-tee ----------
async function read(label: string, conn: Connection, pk: PublicKey) {
  try {
    const info = await conn.getAccountInfo(pk);
    return { label, account: pk.toBase58(), result: info ? `data (${info.data.length} B)` : "null" };
  } catch (e) {
    return { label, account: pk.toBase58(), result: `error: ${String(e).slice(0, 120)}` };
  }
}
const noToken = new Connection(TEE_RPC, "confirmed");
ev.privacy = [
  await read("rprv0 by A raid key (member)", teeR[0], A.slot("rprv", 0)),
  await read("rprv0 by keeper (member)", teeK, A.slot("rprv", 0)),
  await read("rprv0 by B raid key (non-member)", teeR[1], A.slot("rprv", 0)),
  await read("rprv0 without token", noToken, A.slot("rprv", 0)),
  await read("view0 by A raid key (member)", teeR[0], A.slot("view", 0)),
  await read("view0 by B raid key (non-member)", teeR[1], A.slot("view", 0)),
  await read("view0 by keeper (non-member)", teeK, A.slot("view", 0)),
  await read("secret by keeper (member)", teeK, A.secret),
  await read("secret by A raid key (non-member)", teeR[0], A.secret),
  await read("rpub0 by B raid key (public)", teeR[1], A.slot("rpub", 0)),
];
console.table(ev.privacy as object[]);
console.table(ev.cheats as object[]);
ev.sigs = sigs;
ev.baseExplorer = Object.fromEntries(Object.entries(sigs).filter(([k]) => /init|faucet|create|join|delegate/.test(k)).map(([k, v]) => [k, baseTx(v)]));
ev.raid = { id: raidId.toString(), pda: A.raid.toBase58(), escrow: escrow.toBase58() };
console.log(JSON.stringify({ sigs, tickNoAfter10: ev.tickNoAfter10, vrfSeededAfterMs: ev.vrfSeededAfterMs }, null, 2));
saveEvidence("m1-devnet", ev);
void BASE_RPC;
