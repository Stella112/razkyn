// RAZKYN keeper — serve mode (for the public site / judging).
// The keeper sits idle (no SOL spent) until a player asks for a raid from the lobby
// (POST /lobby/open). Then it opens one raid: HUMAN_SLOTS seats for players, the rest labelled
// BOTs, waits HUMAN_WAIT seconds for joins, runs it to settlement and the report, and goes back to
// idle. One raid at a time, at most MAX_PER_HOUR per hour, and only with enough keeper SOL.
//   tsx keeper/src/serve.ts
// Env: RAZKYN_HUMAN_SLOTS (2), RAZKYN_HUMAN_WAIT (150), RAZKYN_MAX_PER_HOUR (4), RAZKYN_MIN_SOL (0.45), WIRE_PORT (8787)
import { LAMPORTS_PER_SOL, PublicKey, SystemProgram } from "@solana/web3.js";
import { runRaid } from "./raid.ts";
import { baseConn, loadKeypair, saveEvidence, sendBase } from "../../scripts/spike-lib.ts";
import { WireServer } from "../wire/server.ts";

const HUMAN_SLOTS = Number(process.env.RAZKYN_HUMAN_SLOTS ?? 2);
const HUMAN_WAIT = Number(process.env.RAZKYN_HUMAN_WAIT ?? 150);
const MAX_PER_HOUR = Number(process.env.RAZKYN_MAX_PER_HOUR ?? 4);
const MIN_SOL = Number(process.env.RAZKYN_MIN_SOL ?? 0.45); // one raid costs ~0.35 SOL in fees and rent

const server = new WireServer();
const keeper = loadKeypair("keeper");
const base = baseConn();
const started: number[] = [];
let busy = false;
let last: { raidId: string; reportHash?: string; error?: string } | undefined;

const log = (s: string) => console.log(`${new Date().toISOString()} ${s}`);

async function canOpen(): Promise<{ ok: boolean; reason?: string }> {
  const hourAgo = Date.now() - 3_600_000;
  while (started.length && started[0] < hourAgo) started.shift();
  if (busy) return { ok: false, reason: "a raid is already running" };
  if (started.length >= MAX_PER_HOUR) return { ok: false, reason: `limit of ${MAX_PER_HOUR} raids per hour reached` };
  const sol = (await base.getBalance(keeper.publicKey).catch(() => 0)) / LAMPORTS_PER_SOL;
  if (sol < MIN_SOL) return { ok: false, reason: `the keeper needs devnet SOL (has ${sol.toFixed(3)}, needs ${MIN_SOL})` };
  return { ok: true };
}

async function idle() {
  server.setLobby({ raidId: "", raid: "", mode: "mystery", slots: 8, humanSlots: [], phase: "idle", joinDeadline: 0, last, canOpen: await canOpen() });
}

server.onOpen = async (mode) => {
  const c = await canOpen();
  if (!c.ok) return { ok: false, error: c.reason };
  busy = true;
  started.push(Date.now());
  log(`opening a ${mode} raid (${HUMAN_SLOTS} human slots, ${HUMAN_WAIT} s to join)`);
  // Run in the background; runRaid publishes the lobby phases as it goes.
  void (async () => {
    try {
      const out = await runRaid({
        mode, slots: 8, humanSlots: Array.from({ length: HUMAN_SLOTS }, (_, i) => i), humanWaitSecs: HUMAN_WAIT, hz: 10,
        wireServer: server, log,
      });
      saveEvidence(`keeper-raid-${out.S.raidId.toString()}`, { reportHash: out.pub.hash, postReportSig: out.pub.sig, reportFile: out.pub.file, tick: out.tick, wire: out.wire });
      last = { raidId: out.S.raidId.toString(), reportHash: out.pub.hash };
      // Keep the finished raid visible for a minute so players see "done" and open the report.
      await new Promise((r) => setTimeout(r, 60_000));
    } catch (e) {
      const raidId = server.lobby?.raidId ?? "";
      last = { raidId, error: String(e).slice(0, 200) };
      log(`raid failed: ${String(e)}`);
      // A failed raid refunds every open pick (cancel_picks on the TEE).
      const { activePicks } = await import("./raid.ts");
      if (activePicks) await activePicks.cancel().then(() => log("picks cancelled and refunded")).catch((x) => log(`pick cancel failed: ${String(x).slice(0, 100)}`));
    } finally {
      busy = false;
      await idle();
    }
  })();
  // Wait until runRaid has created the raid (lobby phase) so the reply carries its id.
  for (let i = 0; i < 120 && !(server.lobby?.phase === "lobby" && server.lobby.raidId); i++) await new Promise((r) => setTimeout(r, 500));
  return { ok: true, raidId: server.lobby?.raidId };
};

// Join-fee gas for judges and new players (devnet only, DECISIONS #44): a wallet with almost no SOL
// gets FUND_SOL once, only while a raid lobby is open, at most FUND_MAX_PER_HOUR per hour, and never
// if it would leave the keeper short of what the next raid needs.
const FUND_SOL = Number(process.env.RAZKYN_FUND_SOL ?? 0.01);
const FUND_BELOW_SOL = 0.005; // the join costs ~0.002 SOL in fees and token-account rent; the lobby asks below 0.005
const FUND_MAX_PER_HOUR = Number(process.env.RAZKYN_FUND_MAX_PER_HOUR ?? 20);
const funded = new Set<string>();
const fundTimes: number[] = [];
server.onFund = async (w) => {
  let wallet: PublicKey;
  try { wallet = new PublicKey(w); } catch { return { ok: false, error: "not a wallet address" }; }
  if (server.lobby?.phase !== "lobby") return { ok: false, error: "funding is offered only while a raid is open for joining" };
  if (funded.has(wallet.toBase58())) return { ok: false, error: "this wallet was already funded" };
  const hourAgo = Date.now() - 3_600_000;
  while (fundTimes.length && fundTimes[0] < hourAgo) fundTimes.shift();
  if (fundTimes.length >= FUND_MAX_PER_HOUR) return { ok: false, error: "funding limit reached for this hour; use faucet.solana.com" };
  const have = (await base.getBalance(wallet)) / LAMPORTS_PER_SOL;
  if (have >= FUND_BELOW_SOL) return { ok: false, error: `wallet already has ${have.toFixed(4)} SOL` };
  const mine = (await base.getBalance(keeper.publicKey)) / LAMPORTS_PER_SOL;
  if (mine - FUND_SOL < MIN_SOL + 0.2) return { ok: false, error: "the game server is low on devnet SOL; use faucet.solana.com" };
  funded.add(wallet.toBase58());
  fundTimes.push(Date.now());
  try {
    const sig = await sendBase(base, [SystemProgram.transfer({ fromPubkey: keeper.publicKey, toPubkey: wallet, lamports: Math.round(FUND_SOL * LAMPORTS_PER_SOL) })], [keeper]);
    log(`funded ${wallet.toBase58()} with ${FUND_SOL} SOL: ${sig}`);
    return { ok: true, sig };
  } catch (e) {
    funded.delete(wallet.toBase58());
    return { ok: false, error: `transfer failed: ${String(e).slice(0, 80)}` };
  }
};

await server.listen();
await idle();
setInterval(() => { if (!busy) void idle(); }, 30_000); // refresh balance / hourly limit
log(`RAZKYN keeper serving on :${server.port} (idle; POST /lobby/open starts a raid)`);
