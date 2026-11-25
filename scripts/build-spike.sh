#!/usr/bin/env bash
# Build the M0 spike program on the Linux filesystem, then copy artifacts back.
set -euo pipefail
cd /mnt/c/magicblock && source scripts/env.sh
B=$HOME/razkyn-build/spikes
mkdir -p $B
rm -rf $B/programs && (cd /mnt/c/magicblock/spikes/anchor && tar --exclude=./target --exclude=./idl -cf - .) | (cd $B && tar -xf -)
cp /mnt/c/magicblock/rust-toolchain.toml $B/
mkdir -p $B/target/deploy
cp $RAZKYN_KEYS/spike-program.json $B/target/deploy/razkyn_spike-keypair.json
cd $B
CARGO_BUILD_JOBS=3 anchor build 2>&1 | grep -v "^ *Compiling" | tail -60
ls -la target/deploy target/idl target/types 2>/dev/null
mkdir -p /mnt/c/magicblock/spikes/anchor/idl
cp target/idl/razkyn_spike.json target/types/razkyn_spike.ts /mnt/c/magicblock/spikes/anchor/idl/
echo BUILD_OK
