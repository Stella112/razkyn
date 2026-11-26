# R A Z K Y N — RAID. TRADE. EXTRACT.

**A market-driven multiplayer extraction game on Solana.** Built for MagicBlock Solana Blitz v10 (Entertainment Finance).

Eight raiders drop into a 64 × 40 map for five minutes. The map is the market: three districts — Tower, Factory and Harbor — each follow an asset's price tape. A rising district glows and wakes dormant crates; a falling one cracks its floor into hazard tiles. Sealed crates hold real (devnet) loot whose contents stay private inside a TEE until someone opens them. Trade at terminals (your position is public while you do), fight in the fog, and stand on an open exit for five seconds to extract — your backpack settles to your wallet. An AI newsroom, **THE WIRE**, narrates every public move.

> Devnet demo. dUSD, dTWR, dFAC, dHRB and dPLAY are devnet stand-in tokens, not shares and not real money. BOT raiders are labelled BOT everywhere.

## How to play

1. **Lobby** (`/play`): connect Phantom or Solflare (or the labelled devnet dev wallet). One signature fauceted 10 dUSD if needed and stakes it: 4.0 protected slot, 5.5 loot pool, 0.5 ops.
2. **Drop**: a raid-scoped key (a burner in your browser) signs every in-raid move on the TEE. No wallet popups, no gas; the raid key can never move tokens.
3. **Move** WASD (touch stick on phones) · **open a crate / trade** E · **shoot** click a raider in range (6 tiles, 34 damage, 500 ms cooldown) · **extract** hold Space on an open exit (windows at 120 s, 210 s and 270 s, 30 s each).
4. **Try to peek** sends real reads of a sealed crate, another raider's private state and the raid secret over the TEE with your own token, and shows the refusal.
5. After the raid: Mystery mode reveals the real day with a Merkle proof the browser checks, THE WIRE writes your debrief, and the **Market Raid Report** (`/report/:id`) recomputes its own hash against the one stored on-chain.

Payouts (Option A): an extracted raider gets the protected slot plus their backpack, minted as dTWR/dFAC/dHRB backed in a reserve; a knocked-out raider gets the protected slot and their backpack drops as a crate; unextracted loot goes back to everyone pro rata by stake. `sum(payouts) + ops == sum(stakes)` is asserted in the program.

## Features

- **Main menu**: Enter Raid · Mystery Market Day · Watch Live · Raid History.
- **Lobby**: open a Mystery or Live raid; you get a seat, a second human can take the other, labelled BOTs fill the rest. One wallet signature (free dUSD + stake).
- **In the raid**: three districts react to their asset (rising = glow and dormant crates wake; falling = cracked floors that drain HP). Sealed crates are ripped open with a 2 s channel; loot lands with a rarity burst (RARE, JACKPOT) and a floating "+dUSD". The backpack value rolls with the market. **Trade alerts** warn you when a raider within 12 tiles is trading (their position is public while they do). Fog of war, shooting, hazards, extraction beacons, synth sound effects and optional **voice narration** of THE WIRE.
- **Try to Peek**: real TEE reads of a sealed crate, another raider and the raid secret, refused.
- **End screen**: EXTRACTED / KNOCKED OUT / STRANDED, payout, an **extraction receipt** (your claim and the settlement transactions), the Mystery reveal ("YOU JUST SURVIVED THE GLOBAL SELLOFF · 5 August 2024" with a sourced summary and outlet links, price data verified against the on-chain Merkle root) and THE WIRE's debrief.
- **Extraction Market** (watch mode): bet free devnet dPLAY play-money on "raider N extracts / doesn't". Bets are real devnet transfers with a memo; the keeper settles each raider's pool parimutuel from the committed result and lists the payout transactions in the report (DECISIONS #33).
- **Market Raid Report** and **Raid History**: every raid's report, hash-checked against the chain.

## MagicBlock stack

| Piece | How RAZKYN uses it | Where |
|---|---|---|
| Private Ephemeral Rollup (TEE, `devnet-tee`) | Every account a raid mutates is delegated to the TEE validator `MTEWGuqx…`; gameplay runs there at 10 ticks/s | `delegate_raid`, `programs/razkyn/src/instructions/lobby.rs` |
| Permissions (`EphemeralPermission`) | Created on the ER: a raider's private state → their raid key + keeper; fog View → that raid key only; sealed crates and the raid secret → keeper only. Public accounts have no permission | `tee_setup.rs`, `crates.rs` |
| `getAuthToken` | Client and keeper authenticate to the TEE; the client signs with the raid key and refreshes 60 s before expiry | `app/src/lib/chain.ts` |
| VRF (`#[vrf]` / `#[vrf_callback]`, ephemeral queue) | One seed per raid → spawns, crate placement and contents, exit plan, Mystery day index | `request_raid_vrf`, `vrf_callback_raid` |
| Pricing Oracle | Live mode reads SOL/BTC/ETH `PriceUpdateV3` feeds on the TEE with key, owner, freshness and `posted_slot` checks | `market.rs` `read_feed` |
| Keeper-driven ticks (crank spike passed) | The keeper calls the permissionless, clock-gated `tick` at 10 Hz; `ScheduleCrankCpi` was proven on the TEE (spike S6) but gameplay uses keeper ticks | `keeper/src/ticker.ts` |
| Magic Actions | `end_raid` commits and undelegates Raid + Results with `MagicIntentBundleBuilder` and a post-commit `finalize_raid` action on the base layer; `settle_stuck_raid` recovers if the action is dropped | `settle.rs` |
| Raid keys | Burner key registered at `join_raid`, valid only for that raid's gameplay instructions, never a token authority | `join_raid`, `require_can_act` |

SDK: `ephemeral-rollups-sdk` 0.18.0 (Rust and npm), Anchor 1.0.2, Agave 3.1.9.

## Trust model

- **The keeper is the game operator.** It creates raids, drives ticks, runs the BOTs, settles and claims for everyone, and builds the report. It is a permission member of raiders' private state, sealed crates and the raid secret — the same trust you give a game server. It cannot change outcomes: movement, damage, loot and events come only from program rules and the VRF seed.
- **The Mystery day is committed before the raid.** A Merkle root of 23 day slices is stored in `create_raid`; the VRF picks the leaf; `verify_slice` checks the loaded slice against the root at that index, and the raid cannot start unverified. The client re-checks the proof after the reveal.
- **What the TEE protects**: sealed crate contents, every raider's position and backpack, each raider's fog view, and the Mystery day. Crate *positions* are public (DECISIONS #16). Public reads (watch mode) use no token.
- **THE WIRE is never a permission member.** It reads public accounts through a token for a fresh key, rebuilds every fact from a public-field whitelist, and every line passes a post-filter (no tickers, dates or prices before the reveal, no invented quotes) or is replaced by a template. It narrates; it decides nothing.
- **Settlement is reconcilable.** Payouts are idempotent (`claimed` records), `finalize_raid` verifies the escrow signer and the committed results hash, and anyone can call `settle_stuck_raid` if the action was dropped.
- **Devnet stand-ins are not shares.** Minted assets are backed by dUSD in a reserve at final prices.

## Run it

Prerequisites (pinned): Rust 1.89.0, Agave 3.1.9, Anchor 1.0.2, Node 24. Scripts run in WSL/Linux after `source scripts/env.sh`.

```bash
npm ci                                    # keeper, scripts, tests
scripts/build.sh                          # anchor build (program + IDL)
scripts/test-magicsvm.sh                  # local MagicSVM suites (15 tests)
npx tsx keeper/src/index.ts --humans 1 --human-wait 300    # one raid: 1 human slot + 7 BOTs
cd app && npm ci && npm run dev           # client on http://localhost:5173
```

The keeper serves `GET /lobby`, `GET /reports/:id` and THE WIRE (`/wire/:id/stream`) on port 8787 (`VITE_KEEPER_URL` points the client at it). THE WIRE uses `claude-sonnet-5-5` when `ANTHROPIC_API_KEY` is set in a local `.env` (never committed) and template lines otherwise.

Devnet: program `CTJGR8bj7HAzFja1YGjvkc9wP2JrFnachqMLeoniox97`; mints in `config/devnet.json`.

### Deployment (judging)

- **Client**: Vercel, https://razkyn.vercel.app (`app/`, build env `VITE_KEEPER_URL`).
- **Keeper**: a VPS (AWS Lightsail, Ubuntu 24.04; ~170 ms round trip to `devnet-tee`) running `keeper/src/serve.ts` as the systemd service in `deploy/razkyn-keeper.service`: idle until a player presses **Open a raid** in the lobby, one raid at a time, at most 4 per hour, only with enough keeper SOL; memory-capped at 600 MB. HTTPS through Caddy (`deploy/Caddyfile.razkyn`) at `https://razkyn.16-61-50-207.sslip.io` (`/lobby`, `/lobby/open`, `/reports/:id`, `/wire/:id/stream`).
- Run only one keeper per keeper wallet at a time (the BOT wallets are shared).

## Tests

- MagicSVM (local): full 8-raider raid settles and claims sum to escrow; determinism; movement cheat and wrong signer rejected; guards on `finalize_raid` / `claim`; `verify_slice` rejects a wrong slice or leaf; payout conservation (randomized).
- Devnet: privacy (test 8), spoiler scan of client traffic (9), THE WIRE leak test (10), settlement recovery (11), 10 Hz load (12), report tamper (13). Results and transaction signatures are in `STATUS.md` and `spikes/results/`.

## Known limitations

- The VRF callback signature cannot be listed: devnet-tee hides signatures of transactions that write private accounts. The report shows the request signatures.
- No scripted in-game event plan: THE WIRE's IN-GAME EVENT lines narrate the rule-driven events (hazards, waking crates, exit windows).
- The Extraction Market is settled by the keeper (a bet is a dPLAY transfer to the keeper's account with a memo), not by an on-chain pool program; it is play-money only and every payout is a devnet transaction in the report.
- Districts track SOL, BTC and ETH only. Stock or gold districts (NVDA, TSLA, gold) would need equity price feeds that MagicBlock's oracle does not offer, plus a program upgrade; Mystery days are crypto days from Binance public data.
- Not built: combat interrupting a trade, trading-halt or rate-shock events, characters and equipment (they need new on-chain rules).
- Mystery day context (title, summary, links) is added after the raid from public reporting; it is not part of the committed Merkle leaf (the price data is).
- About 45% of pipelined moves are rejected by the speed check under network jitter, so effective speed is below the 6 tiles/s cap.
- 10 Hz ticks from a machine far from the Singapore TEE showed occasional gaps just over 1 s; the keeper should run close to the TEE.
- THE WIRE's model path (`claude-sonnet-5-5`) has not been exercised on devnet yet; every line in the recorded raids is a template line.

See `STATUS.md` (what is done, with evidence), `DECISIONS.md` (every deviation from the spec) and `CLAUDE.md` (the build spec).
