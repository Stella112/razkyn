// Payout proof for one raid, from chain data only (no keeper key needed; anyone can run it).
// For every human raider: the claim transaction, their dUSD / dTWR / dFAC / dHRB balances before and
// after it (the transaction's own pre/post token balances), and a simulated second claim showing that
// claiming again is refused, so the balance cannot change twice.
//   tsx scripts/payout-proof.ts <raid_id> [keeper_url]
import * as anchor from "@coral-xyz/anchor";
import { ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { ComputeBudgetProgram, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import { readFileSync } from "fs";
import { PID, idl } from "./raid-lib.ts";
import { baseConn } from "./spike-lib.ts";

const raidId = process.argv[2];
const keeperUrl = (process.argv[3] ?? "https://razkyn.16-61-50-207.sslip.io").replace(/\/$/, "");
if (!raidId) throw new Error("usage: tsx scripts/payout-proof.ts <raid_id> [keeper_url]");
const cfg = JSON.parse(readFileSync(new URL("../config/devnet.json", import.meta.url), "utf8"));
const TOKEN = new PublicKey(cfg.tokenProgram);
const MINTS: [string, PublicKey][] = [["dUSD", cfg.mints.dusd], ["dTWR", cfg.mints.twr], ["dFAC", cfg.mints.fac], ["dHRB", cfg.mints.hrb]].map(([n, k]) => [n, new PublicKey(k)]);
const conn = baseConn();
const P = new anchor.Program(idl, new anchor.AnchorProvider(conn, new anchor.Wallet(Keypair.generate()), {}));
const idb = new anchor.BN(raidId).toArrayLike(Buffer, "le", 8);
const pda = (...s: Buffer[]) => PublicKey.findProgramAddressSync(s, PID)[0];
const ex = (kind: "tx" | "address", v: string) => `https://explorer.solana.com/${kind}/${v}?cluster=devnet`;

const rep = await (await fetch(`${keeperUrl}/reports/${raidId}`)).json();
const report = rep.report;
const settle = P.coder.accounts.decode("settlement", (await conn.getAccountInfo(pda(Buffer.from("settle"), idb)))!.data) as { settled: boolean; settledVia: number };
console.log(`RAZKYN payout proof · raid ${raidId}`);
console.log(`settled on Solana: ${settle.settled} (via ${settle.settledVia === 1 ? "Magic Action finalize_raid" : settle.settledVia === 2 ? "settle_stuck_raid recovery" : settle.settledVia})`);
if (report.settlement?.baseCommit) console.log(`commit + Magic Action: ${ex("tx", report.settlement.baseCommit)}`);
console.log(`report hash on-chain: ${rep.postReportSig ? ex("tx", rep.postReportSig) : "not posted"}\n`);

const escrowAuth = pda(Buffer.from("escrow"), idb);
const DUSD = MINTS[0][1];
for (const r of report.raiders as { slot: number; bot: boolean; wallet: string; extracted: boolean; alive: boolean }[]) {
  if (r.bot) continue;
  const wallet = new PublicKey(r.wallet);
  const claimSig = (report.claims as { slot: number; sig: string }[]).find((c) => c.slot === r.slot)?.sig;
  console.log(`Raider ${r.slot + 1} (human) ${r.wallet} · ${r.extracted ? "EXTRACTED" : r.alive ? "STRANDED" : "KNOCKED OUT"}`);
  if (!claimSig) { console.log("  no claim recorded\n"); continue; }
  const tx = await conn.getTransaction(claimSig, { maxSupportedTransactionVersion: 1, commitment: "confirmed" });
  console.log(`  claim: ${ex("tx", claimSig)} (${tx?.meta?.err ? "FAILED" : "ok"}, slot ${tx?.slot})`);
  const bal = (list: typeof tx extends null ? never : NonNullable<NonNullable<typeof tx>["meta"]>["preTokenBalances"], mint: PublicKey) =>
    Number((list ?? []).find((b) => b.owner === wallet.toBase58() && b.mint === mint.toBase58())?.uiTokenAmount.uiAmountString ?? 0);
  for (const [name, mint] of MINTS) {
    const before = bal(tx?.meta?.preTokenBalances, mint), after = bal(tx?.meta?.postTokenBalances, mint);
    if (before !== after || name === "dUSD") console.log(`  ${name.padEnd(5)} before ${before.toFixed(6)} → after ${after.toFixed(6)}  (${after - before >= 0 ? "+" : ""}${(after - before).toFixed(6)})`);
  }
  // A second claim for the same slot, simulated: it must be refused (nothing can be paid twice).
  const m = MINTS.slice(1).map(([, k]) => k);
  const ix = await P.methods.claim(r.slot).accountsPartial({
    settlement: pda(Buffer.from("settle"), idb), results: pda(Buffer.from("results"), idb), claimRecord: pda(Buffer.from("claim"), idb, Buffer.from([r.slot])), wallet,
    config: pda(Buffer.from("config")), vaultAuth: escrowAuth, stakeVault: getAssociatedTokenAddressSync(DUSD, escrowAuth, true, TOKEN),
    walletDusd: getAssociatedTokenAddressSync(DUSD, wallet, false, TOKEN), mintAuth: pda(Buffer.from("mint_auth")), twrMint: m[0], facMint: m[1], hrbMint: m[2],
    walletTwr: getAssociatedTokenAddressSync(m[0], wallet, false, TOKEN), walletFac: getAssociatedTokenAddressSync(m[1], wallet, false, TOKEN),
    walletHrb: getAssociatedTokenAddressSync(m[2], wallet, false, TOKEN), dusdMint: DUSD, payer: wallet,
    tokenProgram: TOKEN, associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
  } as never).instruction();
  const t = new Transaction().add(ComputeBudgetProgram.setComputeUnitLimit({ units: 600_000 }), ix);
  t.feePayer = wallet; t.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;
  const sim = await conn.simulateTransaction(t.compileMessage(), undefined, false).catch(async () => conn.simulateTransaction(t));
  const nowDusd = Number((await conn.getTokenAccountBalance(getAssociatedTokenAddressSync(DUSD, wallet, false, TOKEN)).catch(() => null))?.value.uiAmountString ?? 0);
  const why = sim.value.err ? ((sim.value.logs ?? []).find((l) => /Error Message|AnchorError|already in use/.test(l))?.replace(/^Program log: /, "").slice(0, 120) ?? JSON.stringify(sim.value.err)) : "NOT refused";
  const plain = /already in use/.test(why) ? "this slot's Claim record already exists, so it can be paid only once" : why;
  console.log(`  second claim (simulated): ${sim.value.err ? "refused" : "ACCEPTED"} · ${plain}`);
  console.log(`  dUSD balance now: ${nowDusd.toFixed(6)}\n`);
}
process.exit(0);
