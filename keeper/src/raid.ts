// Keeper orchestrator: one raid from lobby to claims and report, without manual steps.
//   create → (humans join) → BOT joins → delegate → TEE permissions → VRF → crates →
//   Mystery: load + verify the VRF-chosen day → start → 10 Hz ticks + bots + price recording →
//   end_raid (finalize action) → settle_stuck fallback → claims for every raider → report.
import * as anchor from "@coral-xyz/anchor";
import { Keypair, PublicKey } from "@solana/web3.js";
import { GetCommitmentSignature } from "@magicblock-labs/ephemeral-rollups-sdk";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { RaidSession } from "../../scripts/raid-lib.ts";
import { REPO, loadKeypair, sleep } from "../../scripts/spike-lib.ts";
import { BotCrew } from "./bots.ts";
import { Ticker, type TickStats } from "./ticker.ts";
import { publishReport } from "./report.ts";
import { claimAll } from "./claimer.ts";

const KEYS = process.env.RAZKYN_KEYS ?? join(homedir(), ".config", "razkyn");
const DISTRICTS = ["Tower", "Factory", "Harbor"];

export type RaidOptions = { mode: "mystery" | "live"; slots: number; humanSlots: number[]; humanWaitSecs: number; hz: number; log?: (s: string) => void };

/** Persistent BOT wallets (keys outside the repo); payouts return to them after each raid. */
function botWallet(i: number): Keypair {
  const p = join(KEYS, `bot-${i}.json`);
  if (!existsSync(p)) writeFileSync(p, JSON.stringify(Array.from(Keypair.generate().secretKey)), { mode: 0o600 });
  return loadKeypair(`bot-${i}`);
}

export async function runRaid(o: RaidOptions) {
  const log = o.log ?? ((s: string) => console.log(s));
  const t0 = Date.now();
  const lap = (s: string) => log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${s}`);
  const mystery = o.mode === "mystery";
  const merkle = mystery ? JSON.parse(readFileSync(join(REPO, "data", "mystery", "merkle.json"), "utf8")) : null;
  const S = new RaidSession(new anchor.BN(Date.now()), mystery ? 0 : 1, merkle?.leafCount ?? 0, merkle ? Array.from(Buffer.from(merkle.root, "hex")) : undefined);

  await S.createRaid(o.slots);
  lap(`raid ${S.raidId.toString()} ${S.raid.toBase58()} (${o.mode}) created`);

  // Humans join from the client (join_raid); wait for their slots, then fill the rest with BOTs.
  if (o.humanSlots.length) {
    const until = Date.now() + o.humanWaitSecs * 1000;
    for (;;) {
      const r = (await S.P.account.raid.fetch(S.raid)) as unknown as { raiders: { joined: boolean; wallet: PublicKey; rawKey: PublicKey }[] };
      if (o.humanSlots.every((s) => r.raiders[s].joined) || Date.now() > until) break;
      await sleep(2000);
    }
  }
  const botSlots: number[] = [];
  const humans: number[] = [];
  const raidNow = (await S.P.account.raid.fetch(S.raid)) as unknown as { raiders: { joined: boolean; wallet: PublicKey }[] };
  for (let s = 0; s < o.slots; s++) {
    if (raidNow.raiders[s].joined) { humans.push(s); S.raiders[s] = { wallet: { publicKey: raidNow.raiders[s].wallet } as Keypair, raidKey: Keypair.generate(), bot: false }; continue; }
    await S.join(s, botWallet(s), true);
    botSlots.push(s);
  }
  lap(`joined: humans ${JSON.stringify(humans)}, BOTs ${JSON.stringify(botSlots)}`);

  const delegated = await S.delegateAll();
  await S.connectTee();
  await S.teeSetup(delegated);
  const vrfMs = await S.seed();
  await S.placeCrates();
  let mysteryDay: Record<string, unknown> | null = null;
  let mysterySteps: number[] | null = null;
  if (mystery) {
    const days = JSON.parse(readFileSync(join(REPO, "data", "mystery", "private", "days.json"), "utf8"));
    const idx = await S.leafIndex();
    const day = days[idx];
    const steps = JSON.parse(readFileSync(join(REPO, "data", "mystery", "private", "slices", `${day.day}.json`), "utf8")).steps;
    await S.loadAndVerify(day, steps);
    mysterySteps = steps;
    mysteryDay = { leafIndex: idx, leafCount: merkle.leafCount, root: merkle.root, day: day.day, sliceStart: day.sliceStart, dataHash: day.dataHash, headlinesHash: day.headlinesHash, leaf: day.leaf, proof: day.proof, kind: day.kind, sources: day.urls };
  }
  await S.start();
  // Raid clock: TEE unix time (the WSL clock can be several seconds off).
  const startTs = Number(((await S.readRaid()) as unknown as { startTs: anchor.BN }).startTs.toString());
  const offset = ((await S.teeK.getBlockTime(await S.teeK.getSlot())) ?? Date.now() / 1000) - Date.now() / 1000;
  const elapsed = () => Date.now() / 1000 + offset - startTs;
  lap(`live (VRF ${vrfMs} ms${mystery ? `, mystery leaf ${(mysteryDay as { leafIndex: number }).leafIndex}` : ""})`);

  const ticker = new Ticker(S, o.hz);
  const tickMode = await ticker.start();
  const crew = new BotCrew(S, botSlots, elapsed, Number(S.raidId.toString().slice(-6)));
  const pricePath: { step: number; prices: string[] }[] = [];
  let recording = true;
  const recorder = (async () => {
    while (recording) {
      try {
        const r = (await S.readRaid()) as unknown as { marketStep: number; status: number };
        if (!pricePath.length || pricePath[pricePath.length - 1].step !== r.marketStep) {
          const ds = await Promise.all([0, 1, 2].map((i) => S.districtAcc(i)));
          pricePath.push({ step: r.marketStep, prices: ds.map((d) => d.currentPrice.toString()) });
        }
        if (r.status !== 2) break;
      } catch { /* transient */ }
      await sleep(1000);
    }
  })();
  const crewDone = crew.run();

  // Wait for the end: 300 s, or every raider dead/extracted.
  for (;;) {
    const r = (await S.readRaid()) as unknown as { status: number; raiders: { joined: boolean; alive: boolean; extracted: boolean }[] };
    const allDone = r.raiders.filter((x) => x.joined).every((x) => !x.alive || x.extracted);
    if (r.status !== 2 || allDone || elapsed() > 302) break;
    await sleep(2000);
  }
  const tick: TickStats = await ticker.stop();
  recording = false;
  await recorder;
  await crewDone;
  lap(`raid over; ticks ${tick.landed}/${tick.sent} (${tick.landedPct}%), p95 ${tick.p95} ms, max gap ${tick.maxGapMs} ms, stalls>1s ${tick.stallsOver1s}`);

  // Settlement: end_raid → finalize action; fallback settle_stuck_raid after 120 s.
  const endSig = await S.endRaid();
  let baseCommit = "";
  try { baseCommit = await GetCommitmentSignature(endSig, S.teeK); } catch (e) { baseCommit = `unavailable: ${String(e).slice(0, 80)}`; }
  let st = await S.readSettlement();
  for (let i = 0; i < 40 && !st.settled; i++) { await sleep(1500); st = await S.readSettlement(); }
  let stuckSig: string | null = null;
  if (!st.settled) {
    lap("finalize action did not settle; waiting for settle_stuck_raid");
    await sleep(125_000);
    stuckSig = await S.settleStuck(S.keeper);
    st = await S.readSettlement();
  }
  lap(`settled=${st.settled} via=${st.settledVia}`);

  // Claimer: the keeper claims for every raider (players never need to act).
  const claims = await claimAll(S);
  const res = (await S.readResultsBase())!.data;
  const rpubs = await Promise.all(Array.from({ length: o.slots }, (_, s) => S.P.account.raiderPublic.fetch(S.slot("rpub", s)).catch(() => null)));
  lap("claims done");

  const report = {
    version: 1,
    game: "RAZKYN — market-driven extraction game (devnet demo)",
    network: "devnet",
    programId: S.raid ? S.P.programId.toBase58() : "",
    raid: { id: S.raidId.toString(), pda: S.raid.toBase58(), mode: o.mode },
    assets: DISTRICTS.map((d, i) => ({ district: d, tracks: mystery ? ["SOLUSDT", "BTCUSDT", "ETHUSDT"][i] : ["SOL/USD", "BTC/USD", "ETH/USD"][i], note: mystery ? "revealed after the raid" : "Pricing Oracle on the TEE" })),
    // Mystery: the full path is the verified slice (all 300 steps, index ×10^4). Live: sampled
    // once per second by the keeper from the public District accounts.
    pricePath: mysterySteps
      ? Array.from({ length: 300 }, (_, t) => ({ step: t, prices: [0, 1, 2].map((a) => String(mysterySteps![t * 3 + a])) }))
      : pricePath,
    pricePathSource: mysterySteps ? "verified mystery slice" : "keeper samples of public District prices",
    mystery: mysteryDay,
    vrf: { requests: S.sigs.vrfRequests, callback: "not listed: devnet-tee hides signatures of txs that write private accounts (STATUS.md, M1)" },
    raiders: Array.from({ length: o.slots }, (_, s) => ({
      slot: s, bot: botSlots.includes(s), wallet: res.raiders[s].joined ? (res.raiders[s] as unknown as { wallet: PublicKey }).wallet.toBase58() : null,
      extracted: res.raiders[s].extracted, alive: (rpubs[s] as { alive?: boolean } | null)?.alive ?? null, kills: (rpubs[s] as { kills?: number } | null)?.kills ?? 0,
      mintUnits: res.raiders[s].mintUnits.map(String), dusdPayout: res.raiders[s].dusdPayout.toString(),
      events: crew.events.filter((e) => e.slot === s),
    })),
    results: { stakes: res.stakesTotal.toString(), ops: res.ops.toString(), reserve: res.reserveTotal.toString(), dusd: res.dusdTotal.toString(), leftover: res.leftover.toString(), scaled: res.scaled, finalPrices: res.finalPrices.map(String) },
    settlement: { endRaid: endSig, baseCommit, settledVia: st.settledVia, settleStuck: stuckSig },
    claims,
    tick: { ...tick, mode: tickMode, hz: o.hz },
    wire: [],
  };
  const pub = await publishReport(S, report);
  lap(`report ${pub.hash} posted ${pub.sig}`);
  return { S, report, pub, tick };
}
