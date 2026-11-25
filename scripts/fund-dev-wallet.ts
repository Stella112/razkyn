// Send a little devnet SOL from the keeper to a test wallet (e.g. the client's DEV WALLET) so it can
// pay for its join transaction. Devnet only.
//   tsx scripts/fund-dev-wallet.ts <address> [sol=0.03]
import { LAMPORTS_PER_SOL, PublicKey, SystemProgram } from "@solana/web3.js";
import { baseConn, loadKeypair, sendBase } from "./spike-lib.ts";

const to = new PublicKey(process.argv[2]);
const sol = Number(process.argv[3] ?? "0.03");
if (!(sol > 0 && sol <= 0.1)) throw new Error("devnet test funding is capped at 0.1 SOL");
const keeper = loadKeypair("keeper");
const conn = baseConn();
const sig = await sendBase(conn, [SystemProgram.transfer({ fromPubkey: keeper.publicKey, toPubkey: to, lamports: Math.round(sol * LAMPORTS_PER_SOL) })], [keeper]);
console.log(`sent ${sol} devnet SOL to ${to.toBase58()}: ${sig}`);
console.log(`keeper balance now ${(await conn.getBalance(keeper.publicKey)) / LAMPORTS_PER_SOL} SOL`);
