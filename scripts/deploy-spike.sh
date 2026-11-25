#!/usr/bin/env bash
set -euo pipefail
cd /mnt/c/magicblock && source scripts/env.sh
B=$HOME/razkyn-build/spikes
solana program deploy $B/target/deploy/razkyn_spike.so \
  --program-id $RAZKYN_KEYS/spike-program.json \
  --keypair $RAZKYN_KEYS/keeper.json \
  --url https://rpc.magicblock.app/devnet --use-rpc --max-sign-attempts 50 2>&1 | tail -8
solana program show $(solana-keygen pubkey $RAZKYN_KEYS/spike-program.json) --url https://rpc.magicblock.app/devnet
solana balance $(solana-keygen pubkey $RAZKYN_KEYS/keeper.json) --url https://rpc.magicblock.app/devnet
