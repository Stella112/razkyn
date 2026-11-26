import "./polyfills";
import React from "react";
import ReactDOM from "react-dom/client";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import App from "./App";
import { BASE_RPC } from "./lib/config";
import "@solana/wallet-adapter-react-ui/styles.css";
import "./styles.css";
import "./noir.css";
import { spoilerScan } from "./lib/spoilerScan";

// Test 9 hooks (only with ?record=1): WIRE lines are recorded too, and the scan runs on demand.
if (new URLSearchParams(window.location.search).has("record")) {
  const w = window as unknown as { __razkynWire: unknown[]; __razkynTraffic: { url: string; body: string }[]; __razkynSpoilerScan: () => unknown };
  w.__razkynWire = [];
  w.__razkynSpoilerScan = () => spoilerScan(w.__razkynTraffic ?? [], w.__razkynWire as { text: string; tag: string }[]);
}

// wallets=[]: Wallet Standard wallets (Phantom, Solflare, Backpack, …) register themselves.
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ConnectionProvider endpoint={BASE_RPC}>
      <WalletProvider wallets={[]} autoConnect>
        <WalletModalProvider>
          <App />
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  </React.StrictMode>,
);
