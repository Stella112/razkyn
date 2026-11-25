import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Same setup as the MagicBlock RPS template (vendor/.../rock-paper-scissor/anchor/app/vite.config.ts):
// the ephemeral-rollups-sdk dynamically imports bs58 inside getAuthToken, so pre-bundle it.
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: ["bs58", "buffer", "@coral-xyz/anchor", "@solana/web3.js", "@magicblock-labs/ephemeral-rollups-sdk", "tweetnacl", "phaser"],
  },
  define: { "process.env": {}, global: "globalThis" },
  server: { port: 5173 },
});
