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
| Ephemeral Rollup execution | Gasless movement, shooting, trading and looting at 10 Hz (100 ms ticks; from the game server every tick transaction sent in a 300 s raid confirmed (5,908/5,908), p95 376 ms including network) |
| VRF | Spawns, crate contents, exits, the two market events and the mystery-day pick, verifiable on the report page |
| MagicBlock Pricing Oracle (read on the TEE with full validation) | Live district prices: SOL/BTC/ETH (Live Crypto) or NVDA/TSLA/SOL (Live Markets) |
| Commit + Magic Action | One settlement commit; per-raider claims that can't pay twice, with a recovery path anyone can trigger |
| Raid keys | One wallet signature to join, then no popups |

**Honest limits.** Devnet only. dTWR/dFAC/dHRB are devnet demo tokens, not shares. The keeper is the game operator and holds permission to private state (like a game server). THE WIRE never does.

## Proof of integration (devnet)

Program: `CTJGR8bj7HAzFja1YGjvkc9wP2JrFnachqMLeoniox97` — https://explorer.solana.com/address/CTJGR8bj7HAzFja1YGjvkc9wP2JrFnachqMLeoniox97?cluster=devnet

Ops treasury (fee vault): the keeper's dUSD account [`3gA9REuLgMoe2RTFPucfH2YQbcqFqYyFsfuCxZAwUYbM`](https://explorer.solana.com/address/3gA9REuLgMoe2RTFPucfH2YQbcqFqYyFsfuCxZAwUYbM?cluster=devnet) receives 0.5 dUSD per raider per raid in `finalize_raid` (raid 1795718682996: `ops=4000000` in the program log).

All proofs below are from one fresh full raid, **1795718682996** (Mystery, 1 human + 7 BOTs, 26 Nov 2026, after the 20% protected-slot upgrade `3Wx9wGvT…`). Report: https://razkyn.vercel.app/report/1795718682996

| Proof | Raid | Signature / link |
|---|---|---|
| (a) Delegation to the TEE validator | 1795718682996 | [`3jFMd4D87A…`](https://explorer.solana.com/tx/3jFMd4D87AgVoqDsbPBbDrrTdSAb7KPsTHjP3rWBBaUPvVRNRjD1mcN5GLC5fpjFoVDqf2u3ufpnYbEZM17mwrF?cluster=devnet) (`DelegatePda` × 2, validator `MTEWGuqx…`) |
| (b) TEE transaction | 1795718682996 | `end_raid` on devnet-tee: `4YwKSJZZbkhfP8RtnyZktrK6CS4J1dqYeZPxiKVPgtcacRavt4VvMpa7sx9aUHqbeen8ZQr3Jx1hkUNZoPnG7tLC` (TEE transactions are readable only with a TEE token, so listed as text) |
| (c) VRF | 1795718682996 | request (TEE) `2zP4RK9S7r3pXLmrKm7pckQ4mJfs2S7Kpcv9iuxQc9rDt9s1X6Zhb3WyifMotE3URXFkYDekvGGY1AZ7xKmsNADi`; the callback signature is hidden by devnet-tee (README, limitations) |
| (d) Commit + Magic Action | 1795718682996 | [`5h5j3x6E3G…`](https://explorer.solana.com/tx/5h5j3x6E3Gfb9wujCmN2xJQavuYC1xSxU3PE2S2KQieVh4ym65czeC1AoVtoYopJX5pk4A73BCXKVaqAXfxyhmhj?cluster=devnet): commit → `FinalizeRaid` → "settled raid 1795718682996 via 1" → undelegate |
| (e) Claim | 1795718682996 | [`2fmRq5PyL4…`](https://explorer.solana.com/tx/2fmRq5PyL4cUbxreapR5yDAj2vyxEUjw3SZvAtyChab64L55EXjD3sHBdvc9DQH4rWEvQdn5FzSbkvzwEaC6vzDT?cluster=devnet) (the human seat: 6.61 dUSD = 2.00 protected + pro-rata share); all 8 in the report |
| Report hash on-chain | 1795718682996 | `post_report_hash` [`39Dso3T3ib…`](https://explorer.solana.com/tx/39Dso3T3ibb1YnxT4V6iXuivpko99HjwEYiitYmydaRBYr88d9TaVLhtu9U7uE6SLJu28JKMBUTPRrzrCfQ9JbS7?cluster=devnet) · report sha256 `b5df2791…` |

## Checklist

- [x] Playable site deployed and pointing at a running keeper (razkyn.vercel.app → VPS keeper; raid 1795726083712, 26 Nov)
- [ ] Repo public, README complete, no secrets (`.env`, keys) in history
- [ ] Demo video uploaded
- [x] Explorer links above filled in from a fresh full raid (1795718682996)
- [ ] STATUS.md: all §9 tests with evidence; nothing in "Stubbed" that the demo uses
- [ ] Do not claim "world's first"; say "market-driven extraction game"
