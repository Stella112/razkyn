#!/usr/bin/env bash
# Build the razkyn program on the Linux filesystem, copy IDL/types back into the repo.
set -euo pipefail
cd /mnt/c/magicblock && source scripts/env.sh
B=$HOME/razkyn-build/main
mkdir -p $B
rm -rf $B/programs
(cd /mnt/c/magicblock && tar --exclude=./target --exclude=./node_modules --exclude=./vendor --exclude=./spikes --exclude=./app --exclude=./keeper --exclude=./.git -cf - Anchor.toml Cargo.toml Cargo.lock rust-toolchain.toml programs) | (cd $B && tar -xf -)
mkdir -p $B/target/deploy
cp $RAZKYN_KEYS/razkyn-program.json $B/target/deploy/razkyn-keypair.json
cd $B
CARGO_BUILD_JOBS=3 anchor build 2>&1 | grep -v "^ *Compiling\|Stack offset\|^$" | tail -${TAIL:-60}
ls -la target/deploy/razkyn.so
mkdir -p /mnt/c/magicblock/idl
cp target/idl/razkyn.json target/types/razkyn.ts /mnt/c/magicblock/idl/
cp Cargo.lock /mnt/c/magicblock/Cargo.lock
echo BUILD_OK
