// S3 — Pricing Oracle on the TEE (CLAUDE.md §10).
// Part A (no SOL needed): read the SOL/BTC/ETH feed PDAs over devnet-tee (and base for contrast).
// Part B (--onchain <probeId>): call `read_oracle` on the TEE, which validates key, owner,
//   feed_id, posted_slot > 0, freshness and a positive price inside the program.
// Feed PDA = [b"price_feed", b"pyth-lazer", <lazer id decimal>] under PriCems… (skill pricing-oracle.md).
// Lazer ids / exponents from vendor/starter-kits/oracle-demo/pyth_lazer_list.json: BTC=1, ETH=2, SOL=6, all -8.
import * as anchor from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import {
  BASE_RPC, ORACLE_PROGRAM_ID, loadKeypair, teeConn, spikeProgram, pdas, sendTee,
  txLogs, saveEvidence,
} from "./spike-lib.ts";

const FEEDS = [
  { name: "SOL/USD", lazerId: 6, exponent: -8 },
  { name: "BTC/USD", lazerId: 1, exponent: -8 },
  { name: "ETH/USD", lazerId: 2, exponent: -8 },
];
const MAX_AGE_SECS = 10;

function feedPda(lazerId: number): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("price_feed"), Buffer.from("pyth-lazer"), Buffer.from(String(lazerId))],
    ORACLE_PROGRAM_ID,
  )[0];
}

/** Sequential Borsh decode of the PriceUpdateV2-compatible layout (diagnostic only). */
function decode(data: Buffer) {
  let o = 8; // anchor discriminator
  const writeAuthority = new PublicKey(data.subarray(o, o + 32)).toBase58(); o += 32;
  const vlTag = data[o]; o += 1;
  let verification = "Full";
  if (vlTag === 0) { verification = `Partial(${data[o]})`; o += 1; }
  const feedId = new PublicKey(data.subarray(o, o + 32)).toBase58(); o += 32;
  const price = data.readBigInt64LE(o); o += 8;
  const conf = data.readBigUInt64LE(o); o += 8;
  const exponent = data.readInt32LE(o); o += 4;
  const publishTime = Number(data.readBigInt64LE(o)); o += 8;
  o += 8 + 8 + 8; // prev_publish_time, ema_price, ema_conf
  const postedSlot = data.readBigUInt64LE(o);
  return { writeAuthority, verification, feedId, price: price.toString(), conf: conf.toString(), storedExponent: exponent, publishTime, postedSlot: postedSlot.toString() };
}

async function readFeed(conn: Connection, label: string, pk: PublicKey) {
  const info = await conn.getAccountInfo(pk).catch((e) => ({ error: String(e) }));
  if (!info) return { endpoint: label, found: false };
  if ("error" in info) return { endpoint: label, error: info.error };
  const d = decode(info.data);
  const now = Math.floor(Date.now() / 1000);
  return {
    endpoint: label, found: true, owner: info.owner.toBase58(), dataLen: info.data.length,
    ...d, ageSecs: now - d.publishTime,
  };
}

const keeper = loadKeypair("keeper");
const tee = await teeConn(keeper);
const base = new Connection(BASE_RPC, "confirmed");

const partA: unknown[] = [];
for (const f of FEEDS) {
  const pk = feedPda(f.lazerId);
  const onTee = await readFeed(tee, "devnet-tee", pk);
  const onBase = await readFeed(base, "devnet base", pk);
  const scaled = "price" in onTee && onTee.price ? Number(onTee.price) * 10 ** f.exponent : null;
  const row = { feed: f.name, lazerId: f.lazerId, pda: pk.toBase58(), feedListExponent: f.exponent, usdUsingFeedListExponent: scaled, tee: onTee, base: onBase };
  partA.push(row);
  console.log(JSON.stringify(row, null, 2));
}

let partB: unknown = "skipped (run with --onchain <probeId> after the probe is delegated)";
const i = process.argv.indexOf("--onchain");
if (i > 0) {
  const id = new anchor.BN(process.argv[i + 1]);
  const program = spikeProgram(tee, keeper);
  const { probe } = pdas(program.programId, id);
  const results = [];
  for (const f of FEEDS) {
    const ix = await program.methods
      .readOracle(f.lazerId, f.exponent, new anchor.BN(MAX_AGE_SECS))
      .accountsPartial({ probe, priceFeed: feedPda(f.lazerId) })
      .instruction();
    try {
      const { sig, ms } = await sendTee(tee, [ix], [keeper]);
      const logs = (await txLogs(tee, sig)).filter((l) => l.includes("oracle"));
      results.push({ feed: f.name, ok: true, teeSig: sig, ms: Math.round(ms), logs });
    } catch (e) {
      results.push({ feed: f.name, ok: false, error: String(e).slice(0, 600) });
    }
  }
  partB = results;
  console.log(JSON.stringify(results, null, 2));
}

saveEvidence("s3-oracle", { when: new Date().toISOString(), maxAgeSecs: MAX_AGE_SECS, partA, partB });
