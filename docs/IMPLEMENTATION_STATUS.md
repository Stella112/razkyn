# RAZKYN — implementation status against the product spec v1.0

_Last updated: Thu 26 Nov 2026. Evidence for every "Built" line is in `STATUS.md`, `DECISIONS.md` and `docs/FEATURE_EVIDENCE.md`._

**Legend:** ✅ built and verified on devnet or in MagicSVM · 🟡 partial or built differently from the spec · ❌ not built

## The game

| Spec item | Status | Notes |
|---|---|---|
| 3D city, three-quarter camera, Street / Mall / Farm maps, Day / Night / Storm | ✅ | Three.js scene |
| Districts: NVDA Tower / TSLA Factory / SOL Harbor | ✅ | Live Markets mode (DECISIONS #41). Live crypto mode uses SOL / BTC / ETH; Mystery days are crypto days |
| Interiors, vertical levels, bridges, vaults | ❌ | Flat playfield with buildings around the edge |
| Collision, cover, line of sight | ❌ | Would need a program change; not done before the freeze |
| Characters | 🟡 | Male / female humans with customisation and 3 BOT styles, built from simple shapes; not rigged models |
| Controls: WASD, aim and fire, E, hold Space, Tab inventory, M map, H help | ✅ | |
| Reload, sprint, dodge, weapon switch, ammo | ❌ | One weapon; four classes change its stats |
| Combat decided on-chain (range, cooldown, damage, knockout) | ✅ | 100 HP, 34 per hit |
| Fog of war, private on the TEE | ✅ | Per-player View accounts |
| Sealed crates, VRF contents, "Try to peek" refused by the TEE | ✅ | §9 test 8 |
| Crates with equipment or cosmetics; published odds | ❌ | Crates hold asset units only |
| Backpack: live value, units, protected slot | ✅ | |
| Inventory grid with concentration view | ✅ | Tab (DECISIONS #41) |
| Trading terminals, 3 s exposure, cancelled by a hit | ✅ | |
| Knockout drops the backpack as a crate | ✅ | |
| Extraction windows, hold 5 s, payout to the wallet | ✅ | |
| Settlement states in the UI (ended, committed, settled, recovering, failed, paid) | ✅ | Read from the base-layer Settlement record |
| Protected slot 20% | ✅ | 2.0 of 10 dUSD (DECISIONS #41) |

## Modes, THE WIRE, spectators

| Spec item | Status | Notes |
|---|---|---|
| Live Market Raid (Pricing Oracle on the TEE) | ✅ | US stocks only move in market hours |
| Mystery Market Day: VRF pick, Merkle proof, reveal | ✅ | 23 crypto days. No stock-market days (no free stock history source) |
| THE WIRE live / events / debrief with privacy and spoiler filters | 🟡 | Runs on templates; the AI model path has not run on devnet (needs `ANTHROPIC_API_KEY` on the server) |
| Voice | 🟡 | Browser text-to-speech |
| Market Raid Report with its hash on-chain | ✅ | "Verified ✓" on the report page |
| Shareable social card | ✅ | PNG drawn in the browser, share-to-X and copy-link |
| RAZKYN LIVE on-chain picks (session keys, program-clock locks, crank, leaderboard, VRF badge) | ✅ | DECISIONS #39–#40 |
| More pick types (who extracts first, ambush survival) | ❌ | EXTRACTS, NEXT CRACK, KNOCKOUT only |
| Tradable Extraction Market (bids and asks) | ❌ | The spec lists it as future work |
| Spectator cameras and streamer overlay | ✅ | No replays |
| End-of-raid awards | ✅ | |

## Platform and proof

| Spec item | Status | Notes |
|---|---|---|
| Ephemeral Rollup, Private ER, VRF, oracle, crank, Magic Actions | ✅ | All on devnet; proof links in `SUBMISSION.md` |
| Session keys | 🟡 | The program's own scoped raid and spectator keys, not MagicBlock's session-keys SDK |
| Next.js, Tailwind, Supabase | 🟡 | Vite + React and the keeper's own files |
| Lobby: handles and ready status | ✅ | Signed with the seat raid key; all ready → drop early |
| Settings screen | ✅ | Sound, voice, graphics quality, FPS counter, handle, controls |
| Audio: weapons, sirens, music | 🟡 | Synthesised effects only |
| Two humans in the same raid | ❌ | Not yet tested (1 human + BOTs, plus 2 spectators) |
| Frame rate measured | ❌ | FPS counter built; not yet read on a visible screen |
| Tests | ✅ | MagicSVM 24/24; devnet tests 8–13; picks; profile checks |
