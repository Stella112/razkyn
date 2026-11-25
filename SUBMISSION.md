# SUBMISSION — MagicBlock Solana Blitz v10

Submit at https://build.magicblock.app/?stage=blitz#submit before **Fri 27 Nov 2026, 09:00 EST**.

| Field | Value |
|---|---|
| Project name | RAZKYN |
| One-line description | A market-driven multiplayer extraction game on Solana. |
| Categories | Games, DeFi, Privacy |
| Playable site | _TODO (M8: Vercel deploy)_ |
| GitHub repo | _TODO_ |
| Demo video | _TODO (2 min, see docs/demo-script.md)_ |

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
