#!/usr/bin/env bash
# Deploy (or upgrade) the razkyn program to devnet via the MagicBlock RPC. Extends the program
# data account first when the new build is larger than the current allocation.
set -euo pipefail
cd /mnt/c/magicblock && source scripts/env.sh
U=https://rpc.magicblock.app/devnet
SO=$HOME/razkyn-build/main/target/deploy/razkyn.so
PID=$(solana-keygen pubkey $RAZKYN_KEYS/razkyn-program.json)
NEW=$(stat -c %s $SO)
CUR=$(solana program show $PID --url $U --keypair $RAZKYN_KEYS/keeper.json 2>/dev/null | awk '/Data Length/ {print $3}' || true)
if [ -n "$CUR" ] && [ "$NEW" -gt "$CUR" ]; then
  ADD=$((NEW - CUR))
  [ "$ADD" -lt 10240 ] && ADD=10240   # loader minimum: 10,240 bytes per ExtendProgram
  echo "extending $PID by $ADD bytes ($CUR -> $((CUR + ADD)), need $NEW)"
  solana program extend $PID $ADD --url $U --keypair $RAZKYN_KEYS/keeper.json 2>&1 | tail -2
fi
solana program deploy $SO --program-id $RAZKYN_KEYS/razkyn-program.json --keypair $RAZKYN_KEYS/keeper.json \
  --url $U --use-rpc --max-sign-attempts 50 2>&1 | grep -v "^\s*$" | tail -6
solana balance $(solana-keygen pubkey $RAZKYN_KEYS/keeper.json) --url $U
