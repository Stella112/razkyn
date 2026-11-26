// Base-layer wallet (CLAUDE.md §8: wallet adapter for base-layer actions only).
// Phantom / Solflare via the wallet adapter (Wallet Standard wallets register themselves).
// For testing without an extension: an opt-in DEV WALLET (a devnet burner keypair in
// localStorage, same pattern as the RPS template's burner). It is labelled everywhere and only
// ever holds devnet SOL and devnet demo tokens.
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Keypair, PublicKey, Transaction } from "@solana/web3.js";
import { useMemo, useState } from "react";

const DEV_KEY = "razkyn-dev-wallet";

export function devWalletEnabled() {
  try { return new URLSearchParams(window.location.search).has("devwallet") || !!window.localStorage.getItem(DEV_KEY); } catch { return false; }
}
function devKeypair(): Keypair {
  const s = window.localStorage.getItem(DEV_KEY);
  if (s) return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(s)));
  const k = Keypair.generate();
  window.localStorage.setItem(DEV_KEY, JSON.stringify(Array.from(k.secretKey)));
  return k;
}

export type GameWallet = {
  publicKey: PublicKey | null;
  kind: "adapter" | "dev" | null;
  label: string;
  /** Sign with the wallet and send to the base layer; resolves when confirmed. */
  signAndSend: (tx: Transaction) => Promise<string>;
  /** Sign only (no send), e.g. a co-signature on a rollup transaction. */
  signTx: (tx: Transaction) => Promise<Transaction>;
  enableDev: () => void;
};

export function useGameWallet(): GameWallet {
  const { connection } = useConnection();
  const adapter = useWallet();
  const [dev, setDev] = useState<Keypair | null>(() => (devWalletEnabled() ? devKeypair() : null));
  return useMemo<GameWallet>(() => {
    const confirm = async (sig: string, tx: Transaction) => {
      await connection.confirmTransaction({ signature: sig, blockhash: tx.recentBlockhash!, lastValidBlockHeight: (await connection.getLatestBlockhash()).lastValidBlockHeight }, "confirmed");
      return sig;
    };
    if (adapter.publicKey && adapter.sendTransaction) {
      return {
        publicKey: adapter.publicKey, kind: "adapter", label: adapter.wallet?.adapter.name ?? "Wallet",
        signAndSend: async (tx) => confirm(await adapter.sendTransaction(tx, connection), tx),
        signTx: async (tx) => { if (!adapter.signTransaction) throw new Error("this wallet cannot sign without sending"); return adapter.signTransaction(tx); },
        enableDev: () => setDev(devKeypair()),
      };
    }
    if (dev) {
      return {
        publicKey: dev.publicKey, kind: "dev", label: "DEV WALLET (devnet burner)",
        signAndSend: async (tx) => {
          tx.feePayer = dev.publicKey;
          tx.sign(dev);
          return confirm(await connection.sendRawTransaction(tx.serialize()), tx);
        },
        signTx: async (tx) => { tx.partialSign(dev); return tx; },
        enableDev: () => {},
      };
    }
    return { publicKey: null, kind: null, label: "", signAndSend: () => Promise.reject(new Error("no wallet")), signTx: () => Promise.reject(new Error("no wallet")), enableDev: () => setDev(devKeypair()) };
  }, [adapter.publicKey, adapter.sendTransaction, adapter.signTransaction, adapter.wallet, connection, dev]);
}
