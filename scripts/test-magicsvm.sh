#!/usr/bin/env bash
# Build the program, then run the MagicSVM suite against target/deploy/razkyn.so (Linux FS).
set -euo pipefail
cd /mnt/c/magicblock && source scripts/env.sh
[ "${SKIP_BUILD:-0}" = 1 ] || TAIL=5 bash scripts/build.sh
B=$HOME/razkyn-build/main
rm -rf $B/tests && mkdir -p $B/tests && cp -r /mnt/c/magicblock/tests/magicsvm-rs $B/tests/
[ -f /mnt/c/magicblock/tests/magicsvm-rs/Cargo.lock ] || cp $B/Cargo.lock $B/tests/magicsvm-rs/Cargo.lock
cd $B/tests/magicsvm-rs
RAZKYN_SO=$B/target/deploy/razkyn.so CARGO_TARGET_DIR=$HOME/razkyn-build/tests-target \
  cargo +stable test ${CARGO_TEST_ARGS:-} -- --test-threads=1 ${TEST_FILTER:-} 2>&1 | grep -v "^ *Compiling\|^ *Downloaded\|^ *Downloading" | tail -${TAIL:-80}
