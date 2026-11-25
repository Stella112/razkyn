// Create the five RAZKYN mints on devnet (CLAUDE.md §6.1) as Token-2022 mints with on-mint
// metadata that says "devnet demo", then hand the mint authority to the program PDA ["mint_auth"].
// Idempotent: mint keypairs live in $RAZKYN_KEYS/mint-<symbol>.json; existing mints are skipped.
// Writes the public addresses to config/devnet.json.
// usage: tsx scripts/setup-mints.ts
import {
  Connection, Keypair, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  AuthorityType, ExtensionType, LENGTH_SIZE, TOKEN_2022_PROGRAM_ID, TYPE_SIZE,
  createInitializeMetadataPointerInstruction, createInitializeMintInstruction,
  createSetAuthorityInstruction, getMintLen,
} from "@solana/spl-token";
import { createInitializeInstruction, pack, type TokenMetadata } from "@solana/spl-token-metadata";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { BASE_RPC, REPO, loadKeypair, baseTx } from "./spike-lib.ts";

const PROGRAM_ID = new PublicKey(
  JSON.parse(readFileSync(join(REPO, "idl", "razkyn.json"), "utf8")).address,
);
const MINT_AUTH = PublicKey.findProgramAddressSync([Buffer.from("mint_auth")], PROGRAM_ID)[0];
const KEYS = process.env.RAZKYN_KEYS ?? join(homedir(), ".config", "razkyn");

// Names stay generic: a ticker in a mint name would spoil Mystery mode before reveal.
const MINTS = [
  { key: "dusd", symbol: "dUSD", decimals: 6, name: "RAZKYN dUSD (devnet demo, not money)" },
  { key: "twr", symbol: "dTWR", decimals: 6, name: "Tower asset (devnet demo, not a share)" },
  { key: "fac", symbol: "dFAC", decimals: 6, name: "Factory asset (devnet demo, not a share)" },
  { key: "hrb", symbol: "dHRB", decimals: 6, name: "Harbor asset (devnet demo, not a share)" },
  { key: "play", symbol: "dPLAY", decimals: 0, name: "RAZKYN play-money (devnet demo, no value)" },
];

function mintKeypair(symbol: string): Keypair {
  const path = join(KEYS, `mint-${symbol}.json`);
  if (!existsSync(path)) {
    const kp = Keypair.generate();
    writeFileSync(path, JSON.stringify(Array.from(kp.secretKey)), { mode: 0o600 });
  }
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path, "utf8"))));
}

const conn = new Connection(BASE_RPC, "confirmed");
const keeper = loadKeypair("keeper");
const out: Record<string, string> = {};

for (const m of MINTS) {
  const mint = mintKeypair(m.symbol);
  out[m.key] = mint.publicKey.toBase58();
  if (await conn.getAccountInfo(mint.publicKey)) {
    console.log(`${m.symbol}: exists ${mint.publicKey.toBase58()}`);
    continue;
  }
  const metadata: TokenMetadata = {
    mint: mint.publicKey, name: m.name, symbol: m.symbol, uri: "",
    additionalMetadata: [], // the name itself carries "devnet demo"
    updateAuthority: keeper.publicKey,
  };
  const mintLen = getMintLen([ExtensionType.MetadataPointer]);
  const metaLen = TYPE_SIZE + LENGTH_SIZE + pack(metadata).length;
  const lamports = await conn.getMinimumBalanceForRentExemption(mintLen + metaLen);
  const tx = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: keeper.publicKey, newAccountPubkey: mint.publicKey, space: mintLen, lamports,
      programId: TOKEN_2022_PROGRAM_ID,
    }),
    createInitializeMetadataPointerInstruction(mint.publicKey, keeper.publicKey, mint.publicKey, TOKEN_2022_PROGRAM_ID),
    createInitializeMintInstruction(mint.publicKey, m.decimals, keeper.publicKey, null, TOKEN_2022_PROGRAM_ID),
    createInitializeInstruction({
      programId: TOKEN_2022_PROGRAM_ID, metadata: mint.publicKey, updateAuthority: keeper.publicKey,
      mint: mint.publicKey, mintAuthority: keeper.publicKey, name: m.name, symbol: m.symbol, uri: "",
    }),
    // Hand minting to the program: only faucet/claim instructions can mint from here on.
    createSetAuthorityInstruction(mint.publicKey, keeper.publicKey, AuthorityType.MintTokens, MINT_AUTH, [], TOKEN_2022_PROGRAM_ID),
  );
  const sig = await sendAndConfirmTransaction(conn, tx, [keeper, mint], { commitment: "confirmed" });
  console.log(`${m.symbol}: created ${mint.publicKey.toBase58()}  ${baseTx(sig)}`);
}

mkdirSync(join(REPO, "config"), { recursive: true });
const cfg = { programId: PROGRAM_ID.toBase58(), mintAuth: MINT_AUTH.toBase58(), tokenProgram: TOKEN_2022_PROGRAM_ID.toBase58(), mints: out };
writeFileSync(join(REPO, "config", "devnet.json"), JSON.stringify(cfg, null, 2));
console.log(JSON.stringify(cfg, null, 2));
