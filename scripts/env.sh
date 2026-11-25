# Source from WSL before any RAZKYN build/test/deploy:  source scripts/env.sh
# Pins the CLAUDE.md §4.2 toolchain for this shell only (global defaults untouched).
export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh" >/dev/null
nvm use 24 >/dev/null
# anchor 1.0.2 called directly (the avm proxy shim blocks on stdin in non-interactive shells)
mkdir -p "$HOME/.razkyn-bin"
ln -sf "$HOME/.avm/bin/anchor-1.0.2" "$HOME/.razkyn-bin/anchor"
export PATH="$HOME/.razkyn-bin:$HOME/.local/share/solana/install/releases/3.1.9/solana-release/bin:$HOME/.cargo/bin:$PATH"
export RAZKYN_KEYS="$HOME/.config/razkyn"   # keypairs live outside the repo
export NODE_OPTIONS="--dns-result-order=ipv4first --no-network-family-autoselection"  # WSL: no IPv6 route; slow connects break happy-eyeballs
export CARGO_NET_RETRY=10 CARGO_HTTP_TIMEOUT=120 CARGO_HTTP_MULTIPLEXING=false  # flaky WSL network
