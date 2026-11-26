# R A Z K Y N — RAID. TRADE. EXTRACT.

**A market-driven multiplayer extraction game on Solana.** Built for MagicBlock Solana Blitz v10 (Entertainment Finance).

Eight raiders drop into a 64 × 40 map for five minutes. The map is the market: three districts — Tower, Factory and Harbor — each follow an asset's price tape. A rising district glows and wakes dormant crates; a falling one cracks its floor into hazard tiles. Sealed crates hold real (devnet) loot whose contents stay private inside a TEE until someone opens them. Trade at terminals (your position is public while you do), fight in the fog from behind cover, and stand on an open exit for five seconds to extract — your backpack settles to your wallet. An AI newsroom, **THE WIRE**, narrates every public move.

> Devnet demo. dUSD, dTWR, dFAC, dHRB and dPLAY are transferable devnet game tokens, not shares and not real money. BOT raiders are labelled BOT everywhere.

**Quick start:** open https://razkyn.vercel.app → **DEPLOY** → **OPEN RAID** (Mystery Market) → connect a devnet wallet or press **Use a dev wallet** → join (one signature) → play. After the raid, verify any payout from chain data with `npx tsx scripts/payout-proof.ts <raid_id>`. Program: `CTJGR8bj7HAzFja1YGjvkc9wP2JrFnachqMLeoniox97` (devnet).

## Why MagicBlock

**The problem.** Extraction games are huge, but their loot is worthless outside the game. Trading apps are real, but they feel like casinos. Fantasy stock games teach the market, but nothing you win is real.

**Who has it.** Extraction-game players who grind for loot they can never own, and crypto-curious players who want market stakes with game mechanics instead of a trading terminal.

**Best alternatives and the pain they leave in place**
| Alternative | What still hurts |
|---|---|
| Web2 game server | Players must trust the operator not to peek at loot, rig crates or backdate moves. Prizes are custodied points |
| Plain Solana | ~400 ms confirmations are too slow for live combat, every move costs a fee, and every backpack is public |
| Another fast chain | Cut off from Solana wallets, SPL tokens and the tokenized-asset rails the loot settles into |

**Edge.** Only a TEE-backed rollup at ~10–20 ms of execution time (measured in spike S2, on top of network round trip) lets 8 players fight over hidden, real assets in a live market, where no rival can peek and every move is timestamped onchain.

**What each MagicBlock piece does in RAZKYN**
| Piece | Job |
|---|---|
| Private Ephemeral Rollup (TEE) + permissions | Fog of war, sealed crates, private backpacks, the secret mystery day. "Try to peek" shows the refusal live |
| Ephemeral Rollup execution | Gasless movement, shooting, trading and looting at 10 Hz (100 ms ticks; from the game server every tick transaction sent in a 300 s raid confirmed (5,908/5,908), p95 376 ms including network) |
| VRF | Spawns, crate contents, exits, the two market events and the mystery-day pick, verifiable on the report page |
| MagicBlock Pricing Oracle (read on the TEE with full validation) | Live district prices: SOL/BTC/ETH (Live Crypto) or NVDA/TSLA/SOL (Live Markets) |
| Commit + Magic Action | One settlement commit; per-raider claims that can't pay twice, with a recovery path anyone can trigger |
| Raid keys | One wallet signature to join, then no popups |

**Honest limits.** Devnet only. dTWR/dFAC/dHRB are devnet demo tokens, not shares. The keeper is the game operator and holds permission to private state (like a game server). THE WIRE never does.

## How to play

1. **Lobby** (`/play`): press **DEPLOY**, pick a mode (Mystery Market, Live Crypto, or NVDA · TSLA · SOL), connect Phantom or Solflare (or the labelled devnet dev wallet) and pick a class. One signature faucets 10 dUSD if needed and stakes it: 2.0 protected slot (20%), 7.5 loot pool, 0.5 ops (DECISIONS #41). Set a handle and press READY; when every joined player is ready the raid drops early.
2. **Drop**: a raid-scoped key (a burner in your browser) signs every in-raid move on the TEE. No wallet popups, no gas; the raid key can never move tokens.
3. **Move** WASD (touch stick on phones) · **open a crate / trade** E · **shoot** click a raider in range (6 tiles, 34 damage, 500 ms cooldown; Gunner 7 tiles, 400 ms) · **extract** hold Space on an open exit (windows at 120 s, 210 s and 270 s, 30 s each) · **Tab** inventory · **M** full map. 13 cover blocks (grey with an amber cap) stop movement and shots: the program refuses a move onto cover and a shot without a clear line of sight.
4. **Try to peek** sends real reads of a sealed crate, another raider's private state and the raid secret over the TEE with your own token, and shows the refusal.
5. After the raid: Mystery mode reveals the real day with a Merkle proof the browser checks, THE WIRE writes your debrief, and the **Market Raid Report** (`/report/:id`) recomputes its own hash against the one stored on-chain.

Payouts (Option A): an extracted raider gets the protected slot plus their backpack, minted as dTWR/dFAC/dHRB backed in a reserve; a knocked-out raider gets the protected slot and their backpack drops as a crate; unextracted loot goes back to everyone pro rata by stake. `sum(payouts) + ops == sum(stakes)` is asserted in the program.

## Features

- **Main menu**: Deploy · Mystery Market Day · Character · How to Play · Training Ground (offline practice, nothing on-chain) · Watch Live · Raid History · Settings (sound, voice, graphics, FPS counter, handle, controls).
- **Three modes**: Mystery Market (a real past crypto day, revealed and proven after the raid), Live Crypto (SOL, BTC, ETH) and Live Markets (NVDA, TSLA, SOL).
- **Lobby**: you get a seat, a second human can take the other (two players joining at once are moved to different seats), labelled BOTs fill the rest. One wallet signature (free dUSD + stake). Handles and READY are signed with the seat's raid key; all players ready = early drop.
- **BOT raiders fight**: each BOT sees only what its own fog view shows, shoots raiders in range with a clear line (about once a second, after a short reaction time), and hunts raiders it has seen. The program checks every shot exactly as for a human. BOTs pace their fights so knockouts build up towards the exit windows (DECISIONS #43).
- **Classes** (chosen at join, enforced on-chain): Raider (no perk), Scout (vision 10 tiles instead of 8), Trader (trades in 2 s instead of 3), Gunner (range 7 tiles, shoots every 400 ms).
- **In the raid**: three districts react to their asset (rising = glow and dormant crates wake; falling = cracked floors that drain HP). Sealed crates are ripped open with a 2 s channel; loot lands with a rarity burst (RARE, JACKPOT). The backpack value rolls with the market. **Trade alerts** warn you when a raider within 12 tiles is trading; a hit on a trading raider cancels the trade. **Cover and line of sight** (13 blocks). Fog of war, hazards, extraction beacons, synth sound effects and optional **voice narration** of THE WIRE.
- **Market events**: two per raid, drawn from the VRF seed and committed by hash before the raid (TRADING HALT closes a district's terminals for 30 s; RATE SHOCK tightens hazard thresholds for 30 s; EARNINGS SURPRISE wakes a district's dormant crates). The report page re-checks the plan against the on-chain hash.
- **Try to Peek**: real TEE reads of a sealed crate, another raider and the raid secret, refused.
- **Tab inventory** (protected slot, units and value per asset, share of the bag) and **M full map**.
- **End screen**: EXTRACTED / KNOCKED OUT / STRANDED, payout, settlement steps (raid ended → committed → settled → paid), an **extraction receipt** (your claim and the settlement transactions), a shareable raid card, the Mystery reveal ("YOU JUST SURVIVED THE GLOBAL SELLOFF · 5 August 2024" with a sourced summary and outlet links, price data verified against the on-chain Merkle root) and THE WIRE's debrief.
- **Watch mode** shows public state only, so raiders appear while they trade, when they are knocked out and when they extract; the screen says so, and the first click turns on sound and THE WIRE's voice.
- **RAZKYN LIVE** (watch mode, on-chain): spectators sign once, get 100 non-redeemable play credits and a session key, then pick without popups: EXTRACTS per raider, NEXT CRACK (opens every 60 s, locks after 10 s) and KNOCKOUT IN 30 S (opens every 30 s, locks after 8 s). The program locks picks by its own clock, resolves them from public raid state only and pays parimutuel; a streak of 3 earns a devnet badge whose variant comes from the VRF seed. Spectator cameras and an `/overlay` view for streamers.
- **Extraction Market** (watch mode): bet free devnet dPLAY play-money on "raider N extracts / doesn't", settled by the keeper as devnet transfers listed in the report (DECISIONS #33).
- **Market Raid Report** and **Raid History**: every raid's report, hash-checked against the chain. A matching hash proves the report has not been edited since it was posted; it does not by itself prove every event in it. The on-chain parts (Results, payouts, settlement, claims, the Merkle proof, the market-event plan hash) are checked against chain data on the report page; BOT activity in the report comes from the keeper's own log.

## MagicBlock stack

| Piece | How RAZKYN uses it | Where |
|---|---|---|
| Private Ephemeral Rollup (TEE, `devnet-tee`) | Every account a raid mutates is delegated to the TEE validator `MTEWGuqx…`; gameplay runs there at 10 ticks/s | `delegate_raid`, `programs/razkyn/src/instructions/lobby.rs` |
| Permissions (`EphemeralPermission`) | Created on the ER: a raider's private state → their raid key + keeper; fog View → that raid key only; sealed crates and the raid secret → keeper only. Public accounts have no permission | `tee_setup.rs`, `crates.rs` |
| `getAuthToken` | Client and keeper authenticate to the TEE; the client signs with the raid key and refreshes 60 s before expiry | `app/src/lib/chain.ts` |
| VRF (`#[vrf]` / `#[vrf_callback]`, ephemeral queue) | One seed per raid → spawns, crate placement and contents, exit plan, market events, Mystery day index, spectator badge variant | `request_raid_vrf`, `vrf_callback_raid` |
| Pricing Oracle | Live modes read SOL/BTC/ETH or NVDA/TSLA/SOL `PriceUpdateV3` feeds on the TEE with key, owner, freshness and `posted_slot` checks | `market.rs` `read_feed` |
| Keeper ticks + crank | The keeper calls the permissionless, clock-gated `tick` at 10 Hz for gameplay; RAZKYN LIVE picks resolve every second through a `ScheduleCrankCpi` crank on the TEE (keeper resolve as fallback) | `keeper/src/ticker.ts`, `picks.rs` `schedule_pick_crank` |
| Magic Actions | `end_raid` commits and undelegates Raid + Results with `MagicIntentBundleBuilder` and a post-commit `finalize_raid` action on the base layer; `settle_stuck_raid` recovers if the action is dropped | `settle.rs` |
| Raid keys | Burner key registered at `join_raid`, valid only for that raid's gameplay instructions, never a token authority | `join_raid`, `require_can_act` |

SDK: `ephemeral-rollups-sdk` 0.18.0 (Rust and npm), Anchor 1.0.2, Agave 3.1.9.

## Trust model

- **The keeper is the game operator.** It creates raids, drives ticks, runs the BOTs, settles and claims for everyone, and builds the report. It is a permission member of raiders' private state, sealed crates and the raid secret, the same trust you give a game server.
- **What the keeper cannot do**: change a move, a hit, a crate's contents, a market event, the Mystery day or a payout. Those come only from program rules, the VRF seed and the committed Merkle root, and players send their own moves straight to the TEE with their raid key (not through the keeper). `tick`, `claim` and `settle_stuck_raid` are permissionless, so a stalled keeper can be replaced by anyone.
- **What the keeper could still do** (operator trust, not prevented by code): leak private state it can read (crate contents, positions, the Mystery day) to a player; delay or skip its own tick, BOT and claim transactions; decide when raids open; run the keeper-settled Extraction Market honestly or not. The BOTs are written to use only their own private state and public data (`keeper/src/bots.ts`: crates are chosen by public position), but that is code you have to read, not something the program enforces.
- **The Mystery day is committed before the raid.** A Merkle root of 23 day slices is stored in `create_raid`; the VRF picks the leaf; `verify_slice` checks the loaded slice against the root at that index, and the raid cannot start unverified. The client re-checks the proof after the reveal.
- **What the TEE protects**: sealed crate contents, every raider's position and backpack, each raider's fog view, and the Mystery day. Crate *positions* are public (DECISIONS #16). Public reads (watch mode) use no token.
- **THE WIRE is never a permission member.** It reads public accounts through a token for a fresh key, rebuilds every fact from a public-field whitelist, and every line passes a post-filter (no tickers, dates or prices before the reveal, no invented quotes) or is replaced by a template. It narrates; it decides nothing.
- **Settlement is reconcilable.** Payouts are idempotent (`claimed` records), `finalize_raid` verifies the escrow signer and the committed results hash, and anyone can call `settle_stuck_raid` if the action was dropped.
- **Devnet stand-ins are not shares.** At settlement the program moves the dUSD value of every extracted backpack, at that raid's final prices, into a per-raid reserve, then mints those units as dTWR/dFAC/dHRB. If extracted value would exceed the loot pool (a rally), units are scaled down so the reserve never exceeds the pool; in a fall the difference goes back to everyone pro rata. Conservation (`payouts + reserve + ops == stakes`) is asserted on-chain and tested with randomized prices. Limits: there is no redeem instruction (the reserve is locked backing, not a withdrawable peg), the tokens are fungible across raids although each raid's reserve was set at its own final prices, and integer rounding leaves each raider's reserve at most 1 base unit (0.000001 dUSD) below the exact value.

## Run it

Prerequisites (pinned): Rust 1.89.0, Agave 3.1.9, Anchor 1.0.2, Node 24. Scripts run in WSL/Linux after `source scripts/env.sh`.

```bash
npm ci                                    # keeper, scripts, tests
scripts/build.sh                          # anchor build (program + IDL)
scripts/test-magicsvm.sh                  # local MagicSVM suites (28 tests)
npx tsx keeper/src/index.ts --humans 1 --human-wait 300    # one raid: 1 human slot + 7 BOTs
cd app && npm ci && npm run dev           # client on http://localhost:5173
```

The keeper serves `GET /lobby`, `GET /reports/:id` and THE WIRE (`/wire/:id/stream`) on port 8787 (`VITE_KEEPER_URL` points the client at it). THE WIRE uses `claude-sonnet-5-5` when `ANTHROPIC_API_KEY` is set in a local `.env` (never committed) and template lines otherwise.

Devnet: program `CTJGR8bj7HAzFja1YGjvkc9wP2JrFnachqMLeoniox97`; mints in `config/devnet.json`.

### Deployment (judging)

- **Client**: Vercel, https://razkyn.vercel.app (`app/`, build env `VITE_KEEPER_URL`).
- **Keeper**: a VPS (AWS Lightsail, Ubuntu 24.04; ~170 ms round trip to `devnet-tee`) running `keeper/src/serve.ts` as the systemd service in `deploy/razkyn-keeper.service`: idle until a player presses **DEPLOY → OPEN RAID** in the lobby, one raid at a time, at most 4 per hour, only with enough keeper SOL; memory-capped at 600 MB. HTTPS through Caddy (`deploy/Caddyfile.razkyn`) at `https://razkyn.16-61-50-207.sslip.io` (`/lobby`, `/lobby/open`, `/reports/:id`, `/wire/:id/stream`).
- Run only one keeper per keeper wallet at a time (the BOT wallets are shared).

## Tests

- MagicSVM (local, 28 tests): full 8-raider raid settles and claims sum to escrow; determinism; movement cheat and wrong signer rejected; guards on `finalize_raid` / `claim`; `verify_slice` rejects a wrong slice or leaf; payout conservation (randomized); classes, combat interrupting a trade, committed market events; RAZKYN LIVE picks (program-clock locks, public-only resolver, credits conserved, refunds, badge once); cover (layout, crates never on cover, line of sight, a move and a shot through cover refused).
- Devnet: privacy (test 8), spoiler scan of client traffic (9), THE WIRE leak test (10), settlement recovery (11), 10 Hz load (12), report tamper (13). Results and transaction signatures are in `STATUS.md` and `spikes/results/`.

## Known limitations

- The VRF callback signature cannot be listed: devnet-tee hides signatures of transactions that write private accounts. The report shows the request signatures.
- The Extraction Market (dPLAY bets) is settled by the keeper (a bet is a dPLAY transfer to the keeper's account with a memo); it is play-money only and every payout is a devnet transaction in the report. RAZKYN LIVE picks are the on-chain spectator path.
- Live crypto districts track SOL, BTC and ETH; Live Markets districts track NVDA, TSLA and SOL from the Pricing Oracle on the TEE (the stocks only move in US market hours). Mystery days are crypto days from Binance public data (no free stock history source).
- Not built: reload / ammo, sprint / dodge, weapon switching, items beyond the four classes, a tradable market for minted assets, replays.
- Mystery day context (title, summary, links) is added after the raid from public reporting; it is not part of the committed Merkle leaf (the price data is).
- About 45% of pipelined moves are rejected by the speed check under network jitter, so effective speed is below the 6 tiles/s cap.
- 10 Hz ticks from a machine far from the Singapore TEE showed occasional gaps just over 1 s; the keeper should run close to the TEE.
- THE WIRE's model path (`claude-sonnet-5-5`) has not been exercised on devnet yet; every line in the recorded raids is a template line.

See `STATUS.md` (what is done, with evidence), `DECISIONS.md` (every deviation from the spec) and `CLAUDE.md` (the build spec).
