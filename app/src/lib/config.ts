const env = import.meta.env;

export const BASE_RPC: string = env.VITE_BASE_RPC || "https://rpc.magicblock.app/devnet";
export const TEE_RPC: string = env.VITE_TEE_RPC || "https://devnet-tee.magicblock.app";
/** Keeper HTTP API: /lobby, /reports/:id, /wire/:id/stream (keeper/wire/server.ts). */
export const KEEPER_URL: string = (env.VITE_KEEPER_URL || "http://localhost:8787").replace(/\/$/, "");

export const explorerTx = (sig: string) => `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
export const explorerAddr = (a: string) => `https://explorer.solana.com/address/${a}?cluster=devnet`;
// No TEE explorer links: the RPS template's Solscan link embeds the player's TEE token in a
// third-party URL, which would let that site read the player's private accounts.
