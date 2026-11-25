// Shared helpers for the M0 spikes (CLAUDE.md §10). Run from WSL after `source scripts/env.sh`.
// MagicBlock identifiers come from the skill / SDK 0.18.0:
//   getAuthToken, permissionPdaFromAccount, *_PROGRAM_ID, MAGIC_CONTEXT_ID, EPHEMERAL_VAULT_ID
//   -> vendor/ephemeral-rollups-sdk/ts/web3js/src/{access-control/auth.ts,pda.ts,constants.ts}
import * as anchor from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import nacl from "tweetnacl";
import { getAuthToken } from "@magicblock-labs/ephemeral-rollups-sdk";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const BASE_RPC = "https://rpc.magicblock.app/devnet";
export const ROUTER_RPC = "https://devnet-router.magicblock.app/";
export const TEE_RPC = "https://devnet-tee.magicblock.app";
export const TEE_VALIDATOR = new PublicKey("MTEWGuqxUpYZGFJQcp8tLN7x5v9BSeoFHYWQQ3n3xzo");
export const ORACLE_PROGRAM_ID = new PublicKey("PriCems5tHihc6UDXDjzjeawomAwBduWMGAi8ZUjppd");

const here = dirname(fileURLToPath(import.meta.url));
export const REPO = join(here, "..");
const KEYS = process.env.RAZKYN_KEYS ?? join(homedir(), ".config", "razkyn");

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function loadKeypair(name: string): Keypair {
  const raw = JSON.parse(readFileSync(join(KEYS, `${name}.json`), "utf8"));
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

/**
 * fetch that retries when no HTTP response arrives (DNS/TCP/TLS failures on this link) or on
 * 429. Safe for JSON-RPC: reads are idempotent, and re-sending an already-signed transaction
 * re-submits the same signature, which can land at most once.
 */
export const retryingFetch: typeof fetch = async (input, init) => {
  let last: unknown;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const r = await fetch(input, init);
      if (r.status !== 429) return r;
      last = new Error("HTTP 429");
    } catch (e) {
      last = e;
    }
    await sleep(300 * 2 ** attempt);
  }
  throw last;
};

export const baseConn = () => new Connection(BASE_RPC, { commitment: "confirmed", fetch: retryingFetch });

/** TEE connection authenticated as `kp` (token never printed or written to evidence). */
export async function teeConn(kp: Keypair): Promise<Connection> {
  let auth: { token: string } | undefined;
  for (let attempt = 0; attempt < 4 && !auth; attempt++) {
    try {
      auth = await getAuthToken(TEE_RPC, kp.publicKey, (msg) => Promise.resolve(nacl.sign.detached(msg, kp.secretKey)));
    } catch (e) {
      if (attempt === 3) throw e;
      await sleep(500 * 2 ** attempt);
    }
  }
  return new Connection(`${TEE_RPC}?token=${auth!.token}`, {
    commitment: "confirmed",
    wsEndpoint: `${TEE_RPC.replace(/^http/, "ws")}?token=${auth!.token}`,
    fetch: retryingFetch,
  });
}

export function spikeProgram(conn: Connection, payer: Keypair) {
  const idl = JSON.parse(
    readFileSync(join(REPO, "spikes", "anchor", "idl", "razkyn_spike.json"), "utf8"),
  );
  const provider = new anchor.AnchorProvider(conn, new anchor.Wallet(payer), {
    commitment: "confirmed",
  });
  return new anchor.Program(idl, provider);
}

export function pdas(programId: PublicKey, id: anchor.BN) {
  const le = id.toArrayLike(Buffer, "le", 8);
  const f = (seed: string) =>
    PublicKey.findProgramAddressSync([Buffer.from(seed), le], programId)[0];
  return { probe: f("probe"), secret: f("secret"), flag: f("flag") };
}

export const baseTx = (sig: string) => `https://explorer.solana.com/tx/${sig}?cluster=devnet`;

/** Base-layer send with preflight on. */
export async function sendBase(
  conn: Connection,
  ixs: TransactionInstruction[],
  signers: Keypair[],
): Promise<string> {
  // A tx can expire unconfirmed on a slow link; check whether it landed before re-signing it
  // with a fresh blockhash (max 3 attempts), so non-idempotent instructions never run twice.
  let last: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    const tx = new Transaction().add(...ixs);
    tx.feePayer = signers[0].publicKey;
    try {
      return await sendAndConfirmTransaction(conn, tx, signers, { commitment: "confirmed" });
    } catch (e) {
      last = e;
      const sig = (e as { signature?: string }).signature;
      if (!sig || !String(e).includes("expired")) throw e;
      for (let i = 0; i < 10; i++) {
        const st = (await conn.getSignatureStatus(sig, { searchTransactionHistory: true })).value;
        if (st?.confirmationStatus === "confirmed" || st?.confirmationStatus === "finalized") {
          if (st.err) throw new Error(`tx ${sig} failed: ${JSON.stringify(st.err)}`);
          return sig;
        }
        await sleep(1000);
      }
      console.warn(`base tx expired unlanded (attempt ${attempt + 1}), re-signing`);
    }
  }
  throw last;
}

/** TEE send with preflight on (on the ER preflight is not a simulation; it returns the error). */
export async function sendTee(
  conn: Connection,
  ixs: TransactionInstruction[],
  signers: Keypair[],
): Promise<{ sig: string; ms: number }> {
  const t0 = performance.now();
  const tx = new Transaction().add(...ixs);
  tx.feePayer = signers[0].publicKey;
  tx.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;
  try {
    const sig = await sendAndConfirmTransaction(conn, tx, signers, { commitment: "confirmed" });
    return { sig, ms: performance.now() - t0 };
  } catch (e) {
    // ER blocks are ~10 ms, so a blockhash's validity window is short: block-height-based
    // confirmation can expire although the tx executed (seen for end_raid, M5). Preflight
    // already ran it; check the signature status before reporting a failure.
    const sig = (e as { signature?: string }).signature;
    if (!sig || !String(e).includes("expired")) throw e;
    for (let i = 0; i < 15; i++) {
      const st = (await conn.getSignatureStatus(sig, { searchTransactionHistory: true })).value;
      if (st && (st.confirmationStatus === "confirmed" || st.confirmationStatus === "finalized" || st.confirmationStatus === "processed")) {
        if (st.err) throw new Error(`tx ${sig} failed: ${JSON.stringify(st.err)}`);
        return { sig, ms: performance.now() - t0 };
      }
      await sleep(700);
    }
    throw e;
  }
}

export async function routerStatus(pk: PublicKey): Promise<unknown> {
  const r = await fetch(ROUTER_RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getDelegationStatus", params: [pk.toBase58()] }),
  });
  return (await r.json()) as unknown;
}

/** Poll until `pk` is readable through `conn` (bounded). */
export async function waitVisible(conn: Connection, pk: PublicKey, timeoutMs = 30_000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const info = await conn.getAccountInfo(pk).catch(() => null);
    if (info) return info;
    await sleep(500);
  }
  throw new Error(`${pk.toBase58()} not visible within ${timeoutMs} ms`);
}

export async function txLogs(conn: Connection, sig: string): Promise<string[]> {
  const t = await conn.getTransaction(sig, { maxSupportedTransactionVersion: 0, commitment: "confirmed" });
  return t?.meta?.logMessages ?? [];
}

/** Write machine-readable evidence to spikes/results/<name>.json (no tokens, no secrets). */
export function saveEvidence(name: string, data: unknown) {
  const dir = join(REPO, "spikes", "results");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${name}.json`), JSON.stringify(data, null, 2));
  console.log(`evidence -> spikes/results/${name}.json`);
}

export function pct(values: number[], p: number): number {
  if (!values.length) return NaN;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)];
}
