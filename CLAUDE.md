# CLAUDE.md — RAZKYN build mandate

> **R A Z K Y N — RAID. TRADE. EXTRACT.**
> A market-driven multiplayer extraction game on Solana.
> Hackathon: MagicBlock **Solana Blitz v10** (theme: Entertainment Finance — "trade, collect, compete and win assets you actually own, with game mechanics on top").
> **Hard deadline: Friday 27 Nov 2026, 09:00 EST.** Internal code freeze: Thursday 26 Nov, 23:00 EST.
> Submission page: https://build.magicblock.app/?stage=blitz#submit

This file is the single source of truth for the build. Read it fully at the start of every session. If anything here conflicts with a chat message, ask before acting.

---

## 0. Your role

You are the sole engineer building RAZKYN end to end: Anchor program, off-chain keeper service, AI newsroom (THE WIRE), web client, tests, deployment and submission assets. The owner (Maris) is the product lead. You implement this spec exactly. You do not redesign it.

---

## 1. Non-negotiable rules (read twice)

### 1.1 Truth rules — no hallucination

- Never invent an API, macro, function, account, PDA seed, program ID, endpoint, crate version or CLI flag. Every MagicBlock-specific identifier you use must come from one of these, in this order:
  1. The installed MagicBlock dev skill (`/magicblock`, see §4.1). It is dated 2026-11-24 and is the most current source.
  2. Cloned source in `vendor/` (`magicblock-engine-examples`, `starter-kits`, `ephemeral-rollups-sdk` at tag `v0.18.0`).
  3. https://docs.magicblock.gg
- If a symbol is not found in those sources, stop and say so. Do not guess, and do not "try something that might exist."
- Before using any SDK symbol, grep for it in `vendor/` or `~/.cargo/registry/src/*/ephemeral-rollups-sdk-0.18.0/` and cite the file path in your message.
- Never claim something works without evidence. Evidence = the command you ran plus its output, a passing test name, or a devnet transaction signature with an explorer link. "Should work" is not evidence.
- No fake data presented as real. Bots are labelled "BOT". Devnet tokens are labelled "devnet demo — not a share". Keeper-relayed prices are labelled as relayed. THE WIRE never invents news (§7).
- No silent stubs. If something is stubbed, it goes in `STATUS.md` under "Stubbed / not real yet", with the reason. Never leave a `todo!()`, `unimplemented!()` or fake return in a path the demo uses.
- No secrets in git. Keypairs, `.env` and API keys stay out of git (`.gitignore` them on day one).
- If a command fails, read the full error, find the root cause, and fix it. Do not retry the same thing more than twice. After two failed fixes, stop and report what you tried.

### 1.2 Scope rules — stay in the box

- Build only what §5–§9 describe. No extra features, no "nice to have" additions, no refactors of working code for style.
- Do not change game rules, numbers, the economy, the privacy model, the stack or the versions without asking. If the spec is impossible as written, propose the smallest change, explain why with evidence, and wait for a "yes".
- Every deviation goes in `DECISIONS.md`: date, what changed, why, evidence, and who approved it.
- Work milestone by milestone (§10). Do not start milestone N+1 until milestone N's acceptance checks pass, and show the evidence.
- Keep `STATUS.md` current after every milestone: done, in progress, blocked, stubbed, and next.

### 1.3 Stop and ask when

- A spike (§10, M0) fails and its listed fallback also fails.
- A change would affect money flow, privacy, or what judges see in the demo.
- You need a credential, an API key, SOL from a faucet, or a manual browser action from Maris.
- You are about to delete files or rewrite git history.

### 1.4 How to communicate

- After each milestone, post: what was built, the commands run with key output, test results, devnet signatures, and what's next. Keep it short.
- Put questions in one numbered list at the end of a message, never scattered through it.

---

## 2. Product in one screen

RAZKYN is a real-time, 8-player, top-down extraction raid. The map is the market, the loot is real (devnet) assets, and an AI newsroom (THE WIRE) narrates every public move.

One raid (5 minutes):

1. **Lobby.** The player connects a wallet, picks a mode (Mystery Market Day, the primary demo mode, or Live), and pays a 10 dUSD entry stake on the base layer. A raid-scoped burner key is created, so there are no wallet popups during play.
2. **Drop.** Raiders spawn at VRF-chosen edge points. The map has 3 districts, each tied to one asset: Tower, Factory, Harbor.
3. **The market moves the map.** A rising district glows and wakes dormant crates. A falling district cracks tiles into hazards that drain health.
4. **Sealed crates.** Contents are private until a raider opens one (a 2-second channel). A "Try to peek" button sends a real read request for a sealed crate and shows the TEE refusing it.
5. **Backpack.** The HUD shows the backpack's live dollar value, ticking with prices.
6. **Trade under fire.** At a terminal, swap holdings between assets at the current price. The trade takes 3 seconds and exposes your position to everyone while it runs.
7. **Fight in the fog.** You see other raiders only inside your vision radius. Knocking a raider out drops their backpack as a crate. Their protected slot is untouched.
8. **Extract.** Exits open on a schedule. Stand in one for 5 seconds and your backpack settles to your wallet.
9. **Reveal and debrief.** Mystery mode reveals the real day with a Merkle proof. THE WIRE writes a personal debrief, and a Market Raid Report is generated with its hash stored onchain.

Spectators can bet play-money (dPLAY) on "extracts / doesn't extract" for each raider.

---

## 3. Fixed numbers (do not change without approval)

| Item | Value |
|---|---|
| Raiders per raid | 2–8 (demo: 1 human + up to 7 labelled bots) |
| Raid length | 300 s |
| Game loop tick | 10 Hz target (100 ms). Fallback 5 Hz, which needs Maris's approval |
| Market price step | 1 per second (300 steps per raid); the client interpolates |
| Map | 64 × 40 tiles. Districts: Tower x 0–20, Factory x 22–42, Harbor x 44–63 |
| Positions | Fixed-point: tile × 100 (u16) |
| Max speed | 6 tiles/s (60 units per 100 ms tick). Larger jumps are rejected |
| Vision radius | 8 tiles |
| Health / weapon | 100 HP; 34 damage per hit (3 hits); range 6 tiles; cooldown 500 ms |
| Crates | 36 total, 12 per district: 8 active at start, 4 dormant (woken when the district is ≥ +2% vs raid start) |
| Crate open | 2 s channel, within 1 tile |
| Hazards | District ≤ −2% vs start: its hazard tiles activate, 10 HP/s. ≤ −5%: double the hazard area |
| Terminals | 2 per district. Trade channel 3 s; the trader's position is public while channelling |
| Exits | 4 exit points. Windows open at t = 120 s, 210 s and 270 s; each window uses 2 VRF-chosen exits for 30 s. Stand 5 s to extract |
| Entry stake | 10 dUSD = 2.0 protected slot (20%) + 7.5 loot pool (75%) + 0.5 ops (5%) (changed from 4.0 / 5.5 / 0.5 by DECISIONS #41, approved by Maris) |
| Spectator pool | dPLAY (free faucet token); buying closes 30 s before the last exit window ends |
| Session (raid) key | Valid only for this raid's instructions; expires at raid end + 10 min; can never move tokens |

### Economy rules

- An extracted raider receives protected slot + backpack contents.
- A dead raider receives the protected slot only; their backpack becomes a crate.
- Loot still unextracted at the end goes back to all raiders pro rata by stake. There is no house sweep.
- Trades happen at the current market price, with no spread.
- Conservation invariant, asserted in code and tests: `sum(all payouts in dUSD value at final prices) + ops == sum(stakes)`. All math uses checked integer base units. No floats in the program.

---

## 4. Stack, versions, endpoints (pinned)

### 4.1 Before writing any code

```bash
# 1. MagicBlock's official dev skill for Claude Code
npx skills add https://github.com/magicblock-labs/magicblock-dev-skill
#    (or: git clone https://github.com/magicblock-labs/magicblock-dev-skill && cd magicblock-dev-skill && ./install.sh --claude)
#    Then use /magicblock. Read SKILL.md and references: delegation.md, magic-actions.md, vrf.md,
#    cranks.md, pricing-oracle.md, security.md, debugging.md, local-development.md, fees-and-commit-economics.md

# 2. Reference sources (read-only, never edit)
mkdir -p vendor && cd vendor
git clone --depth 1 https://github.com/magicblock-labs/magicblock-engine-examples
git clone --depth 1 https://github.com/magicblock-labs/starter-kits
git clone --depth 1 --branch v0.18.0 https://github.com/magicblock-labs/ephemeral-rollups-sdk
```

Primary template: `vendor/magicblock-engine-examples/rock-paper-scissor/anchor`. It is a working PER game with a TEE validator, private accounts, `getAuthToken`, burner keys and a Vite app. Copy its patterns, but upgrade the SDK to 0.18.0 API names using the skill.

Also study `private-counter`, `magic-actions`, `roll-dice`, `crank-counter`, `oracle-priced-purchase` and `starter-kits/oracle-demo`.

### 4.2 Versions

| Tool | Version |
|---|---|
| Rust | 1.89.0 (`rust-toolchain.toml`) |
| Solana / Agave CLI | 3.1.9 |
| Anchor | 1.0.2 (`anchor-lang = { version = "1.0.2", features = ["init-if-needed"] }`) |
| `ephemeral-rollups-sdk` (Rust) | =0.18.0, features `["anchor", "access-control", "vrf", "crank"]` |
| `@magicblock-labs/ephemeral-rollups-sdk` (npm) | 0.18.0 exactly. Never `@latest`: latest is 0.20, the validator 2.0 line, which breaks on the TEE |
| `@coral-xyz/anchor` (npm) | 0.32.1, matching the template |
| Node | 24.x |
| Client | Vite + React + TypeScript + Phaser 3 |
| LLM for THE WIRE | Anthropic API, model `claude-sonnet-5-5`, key in `ANTHROPIC_API_KEY` |

Why 0.18.0: the devnet TEE validator runs validator 1.x. SDK 0.20 only supports 2.0 and its `#[vrf]` does not compile. 0.18 supports both. Do not use `cargo add` without a version.

### 4.3 Endpoints and IDs (devnet)

| What | Value |
|---|---|
| Base layer RPC | `https://rpc.magicblock.app/devnet` |
| Router | `https://devnet-router.magicblock.app/` |
| TEE (Private ER) RPC | `https://devnet-tee.magicblock.app` (ws: `wss://devnet-tee.magicblock.app`) — needs a `?token=` from `getAuthToken` |
| TEE validator identity (delegate here) | `MTEWGuqxUpYZGFJQcp8tLN7x5v9BSeoFHYWQQ3n3xzo` |
| Delegation Program | `DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh` |
| Magic Program / Context | `Magic11111111111111111111111111111111111111` / `MagicContext1111111111111111111111111111111` |
| Permission Program (PER) | `ACLseoPoyC3cBqoUtkbjZ4aDrkurZW86v19pXz2XQnp1` |
| VRF Program | `Vrf1RNUjXmQGjmQrQLvJHs9SNkvDJEsRVFPkfSQUwGz` |
| VRF queues | `DEFAULT_QUEUE` (base) / `DEFAULT_EPHEMERAL_QUEUE` (inside ER) — use the SDK constants |
| Pricing Oracle | `PriCems5tHihc6UDXDjzjeawomAwBduWMGAi8ZUjppd` |
| Status API | `https://status.magicblock.app/api/services` (check `devnet` → `tee` before debugging "my code") |

Prefer SDK constants (`ephemeral_rollups_sdk::consts::*`, `vrf::consts::*`) over hard-coded strings.

### 4.4 Known platform facts you must respect (from the skill, 2026-11-24)

- **Single runtime:** every account the game mutates during a raid is delegated to the TEE validator. Public raid accounts simply have no permission; private ones get an `EphemeralPermission`. Do not split the game across a public ER and the TEE: one transaction can only touch accounts in one runtime.
- **PER pattern (new code):** delegate the data PDA on the base layer, then create, update and close its `EphemeralPermission` on the ER via `CreateEphemeralPermissionCpi` / `UpdateEphemeralPermissionCpi` / `CloseEphemeralPermissionCpi`. Pre-fund the PDA for `EphemeralPermission::size_of(max_members)`. Do not use the legacy base-layer permission path.
- **Account visibility on the TEE:** no permission means public. Permission records are visible only to their members.
- **Base-layer account data is public.** Never write a secret (a mystery-day slice, a crate's contents) on the base layer, even before delegation. Secrets are written only on the TEE, after the permission exists.
- **Commits:** use `MagicIntentBundleBuilder`. The deprecated `commit_accounts` / `commit_and_undelegate_accounts` are forbidden. An account larger than 10,240 bytes cannot be committed. Without the fee vault, commit #11 per delegated account fails, so commit only at the end (commit-and-undelegate is always allowed).
- **Magic Actions are not all-or-nothing with the commit.** If an action fails, the committor drops the actions and retries the commit. State can land without payouts. So payouts must be reconcilable: idempotent `settled` / `claimed` flags plus a permissionless recovery path (§6.6). The `#[action]` handler is a normal base-layer instruction anyone can call, so it must verify the injected `escrow_auth` / `escrow` and the committed raid state.
- **VRF:** use the 0.18 `create_request_randomness_ix_const` with `#[vrf]` on the request context and `#[vrf_callback]` on the callback. Do not copy the `gachapon-example` callback (its identity check is unsafe). A successful request is not a result: the outcome exists only after the authenticated callback.
- **Pricing Oracle:** read feeds on the ER only (the base copies are stale). Feeds are `PriceUpdateV3` owned by `PriCems…`. Never declare `Account<PriceUpdateV2>`: check key and owner yourself, then `PriceUpdateV2::try_deserialize_unchecked`. The stored exponent is wrong (+8). Take the exponent from the feed list (−8 for SOL/USD). Feed address = PDA `[b"price_feed", b"pyth-lazer", <lazer id as decimal string>]` under `PriCems…`. Check `posted_slot > 0`, freshness, and positive value.
- **Cranks on the TEE (1.x):** the built-in `ScheduleTask` path (`ScheduleCrankCpi`) is what the 1.x scheduler runs. Do not rely on Hydra on the TEE.
- **ER preflight is not a simulation.** The transaction executes either way. If you skip preflight, check the transaction status and logs.
- Fetch base-layer settlement transactions with `maxSupportedTransactionVersion: 1`.

---

## 5. Repository layout

```
razkyn/
  CLAUDE.md  DECISIONS.md  STATUS.md  README.md  .gitignore  rust-toolchain.toml
  programs/razkyn/            # one Anchor program
  keeper/                     # Node/TS: tick driver, mystery loader, bots, WIRE, report builder, claimer
  app/                        # Vite + React + Phaser client
  data/mystery/               # day slices (rebased), headlines.json, merkle.json  (no secrets for the live raid)
  scripts/                    # setup-mints.ts, create-raid.ts, faucet.ts, spike-*.ts, verify-report.ts
  tests/                      # MagicSVM (Rust) tests + TS devnet integration tests
  vendor/                     # read-only references (gitignored)
```

---

## 6. Onchain design (one Anchor program: `razkyn`)

### 6.1 Mints (created by `scripts/setup-mints.ts`, mint authority = program PDA `["mint_auth"]`)

- `dUSD` (6 decimals): stake token, with a faucet instruction capped at 100 per wallet per day.
- `dTWR`, `dFAC`, `dHRB` (6 decimals): district stand-in assets, minted only at settlement and backed (§6.6). Display names come from the asset each district tracks (for example "dSOL — devnet demo, not a share"). Metadata must say "devnet demo".
- `dPLAY` (0 decimals): spectator play-money, free faucet.

### 6.2 Accounts (keep each under 10,240 bytes; state the size in a comment)

| Account | Seeds | Where | Visibility | Holds |
|---|---|---|---|---|
| `Config` | `["config"]` | Base | public | admin, keeper pubkey, mints, ops treasury |
| `Raid` | `["raid", raid_id]` | Base → TEE | public | mode, status, start/end ts, tick no., raiders[8] (wallet, raid key, alive, extracted, stake), exits schedule, district refs, `day_root`, `event_plan_hash`, `settled`, `report_hash` |
| `Escrow vault` | ATA of PDA `["escrow", raid_id]` | Base only | public | dUSD stakes. Never delegated |
| `District` ×3 | `["district", raid_id, i]` | TEE | public | asset index, start price, current price, price history ring (last 60), hazard level, awake flags |
| `RaiderPublic` ×N | `["rpub", raid_id, slot]` | TEE | public | hp, alive, extracted, exposed flag + position only while trading / after death or extraction, kills |
| `RaiderPrivate` ×N | `["rprv", raid_id, slot]` | TEE | private: that raider's raid key + keeper | position, backpack units per asset (3 × u64), channel state |
| `View` ×N | `["view", raid_id, slot]` | TEE | private: that raider's raid key | positions of other raiders inside vision radius, recomputed every tick |
| `Crate` ×36 (+ drops) | `["crate", raid_id, idx]` | TEE | private: keeper only until opened, then public | position, asset, units, state |
| `RaidSecret` | `["secret", raid_id]` | TEE | private: keeper only | mystery leaf index, loaded price slice (300 steps × 3 assets × u32 rebased ×10⁴ ≈ 3.6 KB), slice hash, VRF seeds |
| `Results` | `["results", raid_id]` | TEE → Base | public | final prices, per-raider payout breakdown, unclaimed pro-rata, `results_hash` |
| `Claim` ×N | `["claim", raid_id, slot]` | Base | public | `claimed` flag (idempotency) |
| `SpecPool` ×N | `["spec", raid_id, slot]` | TEE | public | dPLAY totals yes/no; per-bettor positions in `SpecBet ["bet", raid_id, slot, bettor]` |

The keeper being a permission member is acceptable, because it is the game operator, the same trust as a game server. THE WIRE's service key is never a member of any permission. Disclose this in the README trust model.

### 6.3 Instructions

Columns: name, who signs, where it's sent.

**Setup / lobby (base layer)**

- `init_config` (admin, base) · `faucet_dusd`, `faucet_play` (user, base)
- `create_raid(raid_id, mode, day_root, event_plan_hash)` (keeper, base): creates Raid, Districts, RaiderPublic/Private, View, Crates, RaidSecret, SpecPools, and pre-funds each private PDA for its permission rent.
- `join_raid(slot, raid_key_pubkey)` (player wallet, base): transfers the 10 dUSD stake into escrow and registers the raid key. Closes at raid start.
- `delegate_raid` (keeper, base): delegates every TEE account to validator `MTEWGuqx…`. Not the escrow.

**On the TEE (keeper)**

- `setup_permissions` (keeper, TEE): `CreateEphemeralPermissionCpi` for each private account with exactly the members listed in §6.2.
- `request_raid_vrf` / `vrf_callback_raid` (keeper → VRF): one 32-byte seed. Derive spawns, crate placement and contents (splitting the 75% loot pool across the 24 active + 12 dormant crates), exit choices and the mystery leaf index with domain-separated `hash(seed ‖ label ‖ i)`. Results go only into private accounts.
- `load_slice(chunk_index, bytes)` (keeper, TEE, Mystery mode): writes the chosen day's slice into `RaidSecret` in chunks. Then `verify_slice(merkle_proof)` checks `hash(slice) == leaf.data_hash`, `leaf.index == vrf_leaf_index` and the proof against `Raid.day_root`. The raid cannot start until verified. So the keeper cannot cheat: it can only load the slice the VRF chose.
- `start_raid` (keeper, TEE): sets status Live and the start timestamp.

**Gameplay (raid key, TEE, gasless)**

- `move_to(dx, dy)`: validates max speed per elapsed ms, map bounds and alive.
- `shoot(target_slot)`: the program checks cooldown, range from the private positions, and that the target is alive. It applies damage. On a kill: mark dead, publish the victim's last position, and convert their backpack into a new public-position crate.
- `open_crate(idx)` (start) and `finish_open(idx)` (after 2 s, still in range): moves units into the backpack and makes the crate public.
- `start_trade(from_asset, to_asset, units)` → `finish_trade` (≥ 3 s later, at the then-current price): sets `exposed = true` and copies the position into `RaiderPublic` while channelling.
- `start_extract(exit)` → `finish_extract` (≥ 5 s inside an open exit window): marks extracted and freezes the backpack.
- `place_bet(slot, side, amount)` (spectator wallet, TEE): dPLAY only.

**Tick (permissionless, clock-gated)**

- `tick()`: anyone may call it. It advances at most once per 100 ms, using `Clock`. Each tick: apply the market step when a second boundary passes (Mystery: read `RaidSecret` slice; Live: read the oracle feed with full validation), update hazards and dormant crates, apply hazard damage, recompute every `View` (fog), open or close exits, and end the raid at 300 s.
- The keeper calls `tick` at 10 Hz. Optionally also schedule it via `ScheduleCrankCpi` (spike S4). Gameplay must work with keeper-driven ticks alone.

**Settlement**

- `end_raid` (anyone, TEE, after 300 s or when all raiders are done): freezes state; computes `Results` (final prices, each raider's protected slot, backpack value, pro-rata unclaimed loot, ops); asserts conservation; makes all crate and backpack contents public; then one `MagicIntentBundleBuilder` commit-and-undelegate of `Raid` + `Results` (+ public accounts as needed), with a post-commit action → `finalize_raid`.
- `finalize_raid` (`#[action]`, base): verifies `escrow_auth` / `escrow` and that the committed `Results` belong to this raid; sets `Raid.settled = true`; moves ops to the treasury; moves the backing for minted assets into the reserve. Idempotent.
- `claim(slot)` (permissionless, base): requires `settled`, and `Claim.claimed == false`. Pays the protected slot + pro-rata dUSD and mints backpack units as `dTWR/dFAC/dHRB` (backing already in reserve). Sets `claimed`. The keeper's claimer loop calls it for every raider, so players never need to act.
- `settle_stuck_raid` (permissionless, base): if `Results` is committed but `settled == false` after 120 s (the actions were dropped), performs the same work as `finalize_raid`.
- `post_report_hash(hash)` (keeper, base, once): stores the Market Raid Report hash.
- `settle_spec_pools` runs inside `end_raid`: parimutuel, using the committed extraction outcome only.

### 6.4 Mystery Market Day integrity

- Offline: build 20+ slices in `data/mystery/` (famous and ordinary days mixed). Each slice is 300 one-second steps × 3 assets, rebased to 100.0000 at step 0. Leaf = `hash(day_id ‖ slice_start ‖ data_hash ‖ headlines_hash)`. Publish `merkle.json` (root and leaves without day IDs; keep the preimages in `data/mystery/private/`, gitignored until after the demo) and put the root in `create_raid`.
- On the TEE: VRF picks the leaf; the keeper loads that slice; `verify_slice` checks it. Players only ever see rebased steps. District names stay generic. No ticker, date or absolute price is ever sent to clients before reveal (test this, §9).
- Reveal at `end_raid`: publish the leaf preimage and proof. The client verifies it against the root and shows "Verified ✓".
- Data sources: use free 1-minute klines from `https://data.binance.vision` (spot, e.g. BTCUSDT / ETHUSDT / SOLUSDT) for crypto days. Compress each chosen window into 300 steps. Equity days are out of scope unless Maris supplies CSVs. Do not scrape paid sources. Record every source URL in `data/mystery/SOURCES.md`.

### 6.5 Live mode

District prices come from the MagicBlock Pricing Oracle on the TEE (SOL/USD, BTC/USD, ETH/USD feeds; derive addresses from the Lazer IDs in the feed list, with exponents from that list). Spike S3 decides whether the feeds are readable on `devnet-tee`. If not, the fallback (needs approval) is: the keeper reads the oracle on `devnet-as`, then writes a keeper-signed `PricePush` into a public account on the TEE, labelled "relayed by keeper" in the UI and README.

### 6.6 Security checklist (each item needs a test)

- Every gameplay instruction checks that the signer is the registered raid key for that slot, that the raid is Live, and that the raider is alive and not extracted.
- Raid keys can never sign token transfers. The escrow is base-only and its authority is the program PDA.
- `finalize_raid`, `claim` and `settle_stuck_raid` are safe if called directly by anyone (idempotent and verified).
- Movement, damage, loot and events come only from program rules and VRF. No client-supplied outcomes.
- Conservation assertion in `end_raid` and in `claim`.
- Checked arithmetic everywhere. No `unwrap()` on user input.

---

## 7. THE WIRE (AI newsroom) — `keeper/wire/`

THE WIRE narrates. It never decides damage, loot, events or payouts.

**Input:** only the public event stream: district prices and hazards, public raider fields, opened crates, exposed trades, kills, extractions, fired events. It subscribes to public accounts only, using a connection that holds no TEE auth token of any permission member. This makes leaks impossible by construction.

| Part | When | Output |
|---|---|---|
| WIRE LIVE | During the raid, batched every ~3 s | One ticker line, ≤ 90 characters |
| WIRE EVENTS | When a committed event fires | One line explaining it, tagged `IN-GAME EVENT` |
| WIRE DEBRIEF | After the raider is done | ≤ 120 words for that raider, using the public log plus their own (now public) trades |

**Hard rules, enforced in code, not only in the prompt:**

- Only public facts are sent to the model.
- No invented news. In Mystery mode, the DEBRIEF may quote only headlines in `headlines.json`, and every entry has a timestamp and a source URL. If an entry has no URL, it is not shipped. Live mode talks about price moves only.
- Fiction is labelled `IN-GAME EVENT`.
- No spoilers before reveal: relative moves only ("down 4% in two minutes"). A post-filter rejects any output containing a ticker, a year, a month name, a company name or a `$` price before reveal, and uses a template instead.
- If an LLM call takes longer than 1.5 s, use the template lines in `wire/templates.ts`. The demo must never wait on the LLM.
- The system prompt lives in `wire/prompt.md`. Commit it.

---

## 8. Client — `app/`

- Vite + React + TS. Phaser 3 for the map. Wallet adapter (Phantom / Solflare) for base-layer actions only.
- Connections: base (`rpc.magicblock.app/devnet`); TEE with `getAuthToken` signed by the raid key (the burner keypair in localStorage, as in the RPS template). Cache the token and refresh it 60 s before it expires.
- **Screens:** Landing (wordmark "R A Z K Y N", tagline "RAID. TRADE. EXTRACT.", Play / Watch) → Lobby (mode, faucet buttons, stake, raider list, bots toggle) → Raid → Reveal + Debrief → Report page (`/report/:raidId`).
- **Raid HUD:** HP, backpack value with sparkline, protected slot, timer, next exit window, THE WIRE ticker along the bottom (chyron style, `BREAKING` / `IN-GAME EVENT` tags).
- **Look:** dark trading floor at night. Rising district = green glow and crate shimmer. Falling = red flicker and cracking tiles. Soft radial fog. Muzzle flashes and exposed trades light up through the fog.
- **"Try to peek":** calls `getAccountInfo` on a sealed crate's PDA and on another raider's `RaiderPrivate` over the TEE, using your token. It shows the actual refusal or empty result, and a lock animation.
- **Watch mode:** spectator view with public state only and dPLAY betting.
- **Report page:** recomputes the report hash and compares it with the onchain `report_hash` → "Verified ✓" / "Mismatch". Shows the VRF request and callback signatures, the Merkle proof check, and settlement and claim signatures with explorer links.
- **Controls:** WASD / touch stick to move, click or tap to shoot, E to open or trade, hold Space to extract.
- Mobile-friendly (landscape).
- **Bots** (`keeper/bots/`): up to 7 simple bots that each use their own raid key and send real transactions: wander, open crates, trade at random, extract at the last window. Labelled `BOT` everywhere.
- **Market Raid Report** (`keeper/report/`): JSON containing mode, assets, price path, revealed day + proof, events vs the committed plan, each raider's trades / kills / extraction / payout, VRF signatures, settlement and claim signatures, and WIRE debriefs with cited headline URLs. Hash = sha256 of canonical JSON. Hosted as a static file. Hash posted via `post_report_hash`.

---

## 9. Testing (required)

**Local (MagicSVM, see the skill's `local-development.md`, and `vendor/.../rock-paper-scissor/anchor/tests-magicsvm-rs`):**

1. Full raid with 8 scripted raiders → raid ends, Results conserve value, claims sum to escrow.
2. Determinism: same seed + same slice → identical event log and payouts.
3. Movement cheat (a jump beyond max speed) → rejected.
4. Wrong signer for a slot → rejected.
5. Calling `finalize_raid` / `claim` directly from a random wallet before settlement → rejected; calling `claim` twice → second call is a no-op or error, never pays twice.
6. `verify_slice` with the wrong slice or the wrong leaf → rejected.
7. Spectator pools fully distributed, proportional.

**Devnet (TS scripts in `tests/devnet/`):**

8. Privacy: from a non-member token, read a sealed crate, another raider's `RaiderPrivate`, and `RaidSecret` → every read refused or empty on `devnet-tee`.
9. Spoiler: record the client's network traffic during a Mystery raid → no ticker, date or absolute price before reveal.
10. WIRE leak: feed a log that includes a live private backpack → output never mentions it.
11. Settlement failure: make `finalize_raid` fail once (feature flag), confirm `settle_stuck_raid` recovers, and nobody is paid twice.
12. Load: 8 raiders (bots) at 10 Hz for 300 s, with no stalls > 1 s.
13. Report tamper: edit the report JSON → page shows "Mismatch".

---

## 10. Milestones (in order; each needs evidence before moving on)

### M0 — Spikes on devnet (do these first; report results before M1)

| Spike | Check | Pass | Fallback (ask before switching) |
|---|---|---|---|
| S1 PER | Delegate one PDA to `MTEWGuqx…`, create an `EphemeralPermission` on the ER for wallet A, read it with A's and B's tokens | A reads, B refused | None. This is core, so stop and report |
| S2 Tick rate | A permissionless `tick` called at 10 Hz for 60 s on the TEE, plus a move tx from a raid key | ≥ 95% of ticks land, < 300 ms p95 | 5 Hz |
| S3 Oracle on TEE | Read the SOL/USD `PriceUpdateV3` feed on `devnet-tee` with full validation | Fresh price, `posted_slot > 0` | Keeper-relayed `PricePush` (§6.5) |
| S4 VRF on TEE | `create_request_randomness_ix_const` with `DEFAULT_EPHEMERAL_QUEUE` from a TEE-delegated account, `#[vrf_callback]` lands | Callback within 5 s | Request on base before delegation, mixed with a keeper secret committed as a hash in `create_raid` and revealed at the end. Seed = hash(vrf ‖ secret). Document it |
| S5 Magic Action | Commit-and-undelegate with one post-commit `#[action]` that writes a flag on base | Flag set on base; also observe what happens when the action is forced to fail | — (the recovery path is already in the design) |
| S6 Crank (optional) | `ScheduleCrankCpi` 100 ms task on the TEE | Fires repeatedly | Keeper-driven ticks only (already the primary path) |

- **M1** — Program core: config, mints, faucet, create / join / delegate, permissions, VRF seed + derivations, tick, movement, fog `View`. MagicSVM tests 3, 4.
- **M2** — Loot and combat: crates (incl. dormant), open, shoot, death → drop crate, hazards. Tests 1 (partial), 2.
- **M3** — Market: Mystery slice pipeline + `verify_slice` + data build script + Merkle; Live oracle path or fallback; trades with exposure. Test 6.
- **M4** — Settlement: `end_raid`, Results + conservation, commit-and-undelegate + `finalize_raid` action, `claim`, `settle_stuck_raid`, spectator pools. Tests 1, 5, 7, 11.
- **M5** — Keeper: tick driver, mystery loader, claimer, bots, report builder + `post_report_hash`. Test 12.
- **M6** — THE WIRE: live, events, debrief, filters, templates. Test 10.
- **M7** — Client: all screens, HUD, peek, watch mode, report page. Tests 8, 9, 13.
- **M8** — Ship: deploy the program to devnet, deploy the app (Vercel), run the keeper (Railway/Render or a local machine during judging; document which), README, 2-minute demo script, submission checklist.

Freeze at Thursday 23:00 EST. After the freeze: bug fixes only.

---

## 11. Submission deliverables (`SUBMISSION.md`)

- Project name RAZKYN; one-line description "A market-driven multiplayer extraction game on Solana."; categories: Games, DeFi, Privacy.
- Links: playable site, GitHub repo, demo video.
- Proof of integration: program ID, fee / ops vault, explorer links to (a) a delegation, (b) a TEE gameplay tx, (c) a VRF callback, (d) the commit with Magic Action, (e) a claim.
- README: what it is, how to play, the MagicBlock stack table (ER/PER, permissions, VRF, oracle, crank-or-keeper, Magic Actions, raid keys), the trust model (keeper is operator and a permission member; THE WIRE is not; what the TEE protects; devnet stand-in tokens are not shares), run instructions, known limitations.
- Do not claim "world's first". Use "market-driven extraction game".
- Demo video beat sheet (2 min): hook (wordmark + tagline) → crate peek denied → bag ticks up, THE WIRE calls a drop, a district cracks → trade under fire, ambush, extract → mystery reveal + debrief → report verify (VRF, Merkle, settlement tx) → MagicBlock stack slide.

---

## 12. Definition of done

- [ ] All MagicSVM tests and devnet tests in §9 pass, and the output is pasted in `STATUS.md`.
- [ ] A full 8-raider Mystery raid (1 human + 7 bots) runs on devnet from lobby to claims, without manual intervention.
- [ ] Every private read in "Try to peek" is refused on the TEE.
- [ ] The report page shows "Verified ✓" for a real raid.
- [ ] `STATUS.md` has no item under "Stubbed / not real yet" that appears in the demo.
- [ ] `SUBMISSION.md` complete, with all explorer links.

## 13. References

- MagicBlock dev skill: https://github.com/magicblock-labs/magicblock-dev-skill
- Engine examples: https://github.com/magicblock-labs/magicblock-engine-examples (rock-paper-scissor, private-counter, magic-actions, roll-dice, crank-counter, oracle-priced-purchase)
- Starter kits: https://github.com/magicblock-labs/starter-kits (oracle-demo, vrf-demo)
- SDK: https://github.com/magicblock-labs/ephemeral-rollups-sdk (tag v0.18.0)
- Docs: https://docs.magicblock.gg — PER access control `/pages/private-ephemeral-rollups-pers/how-to-guide/access-control`, quickstart `/pages/private-ephemeral-rollups-pers/how-to-guide/quickstart`, oracle `/pages/tools/oracle/introduction`
- Binance public data: https://data.binance.vision
