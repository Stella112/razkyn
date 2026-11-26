# SUBMISSION — MagicBlock Solana Blitz v10

Submit at https://build.magicblock.app/?stage=blitz#submit before **Fri 27 Nov 2026, 09:00 EST**.

| Field | Value |
|---|---|
| Project name | RAZKYN |
| One-line description | A market-driven multiplayer extraction game on Solana. |
| Categories | Games, DeFi, Privacy |
| Playable site | https://razkyn.vercel.app |
| GitHub repo | _TODO_ |
| Demo video | _TODO (2 min, see docs/demo-script.md)_ |

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
| Ephemeral Rollup execution | Gasless movement, shooting, trading and looting at 10 Hz (100 ms ticks; from the game server 5,908/5,908 ticks landed in a 300 s raid, p95 376 ms including network) |
| VRF | Spawns, crate contents, exits and the mystery-day pick, verifiable on the report page |
| MagicBlock Pricing Oracle (read on the TEE with full validation) | Live-mode district prices |
| Commit + Magic Action | One settlement commit; per-raider claims that can't pay twice, with a recovery path anyone can trigger |
| Raid keys | One wallet signature to join, then no popups |

**Honest limits.** Devnet only. dTWR/dFAC/dHRB are devnet demo tokens, not shares. The keeper is the game operator and holds permission to private state (like a game server). THE WIRE never does.

## Proof of integration (devnet)

Program: `CTJGR8bj7HAzFja1YGjvkc9wP2JrFnachqMLeoniox97` — https://explorer.solana.com/address/CTJGR8bj7HAzFja1YGjvkc9wP2JrFnachqMLeoniox97?cluster=devnet

Ops treasury (fee vault): the keeper's dUSD ATA receives 0.5 dUSD per raider per raid (`finalize_raid`). _TODO: paste the ATA address._

| Proof | Raid | Signature / link |
|---|---|---|
| (a) Delegation to the TEE validator | M2 run `CXSon4Rb…` | `2PwwZgtK…` _TODO: full signature + link from spikes/results/m2-devnet.json_ |
| (b) TEE gameplay tx | — | TEE txs are readable only with a TEE token; list a move/open signature as text. _TODO_ |
| (c) VRF | raid 1795628725761 | request (TEE) `3Z2J4mY6…` from the report; the callback signature is hidden by devnet-tee (README, limitations) |
| (d) Commit + Magic Action | raid 1795628725761 | base commit `9s25P1fS…` → settled via `finalize_raid` _TODO: full link_ |
| (e) Claim | raid 1795628725761 | 8 claim txs in `/report/1795628725761` _TODO: one full link_ |
| Report hash on-chain | raid 1795628725761 | `post_report_hash` `1tjfAjNT…`, page shows "Verified ✓" |

## Checklist

- [ ] Playable site deployed and pointing at a running keeper (Singapore region)
- [ ] Repo public, README complete, no secrets (`.env`, keys) in history
- [ ] Demo video uploaded
- [ ] Explorer links above filled in from a fresh full raid
- [ ] STATUS.md: all §9 tests with evidence; nothing in "Stubbed" that the demo uses
- [ ] Do not claim "world's first"; say "market-driven extraction game"
