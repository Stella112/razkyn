# Feature evidence — 3D overhaul (2026-11-26)

Status: **Built** = implemented and seen working; **Partial** = works with a stated gap; **Not built** = not in this build.
Screenshots are in `docs/screens/`. Devnet raids: 1795697137007 (Mystery, 3D client, played), 1795697851949 (Live crypto, 3D client).

| # | Acceptance test (from the directive) | Status | Evidence |
|---|---|---|---|
| 1 | Real 3D operator walks, runs, aims, interacts in a lit 3D district; camera follows; cover and collision | **Partial** | Three.js scene with jointed, code-animated operators (run cycle, aim yaw to cursor, recoil, flinch, downed, extract lift) — `after-training-fire.jpg`, `after-live-raid-hud.jpg`, `after-live-raid-knocked-out.jpg`. Damped three-quarter camera, zoom, gantry fade for occlusion. **Collision = the program's map bounds only.** The program lets raiders walk every tile, so there is no cover / line-of-sight rule on-chain; solid-looking scenery is kept outside the playfield so the picture never contradicts the rules. Adding cover needs a program change. |
| 2 | Small HUD with truthful health, bag value, timer, extract state, THE WIRE, minimap | **Built** | `after-live-raid-hud.jpg`: health + backpack (rolling value, sparkline, per-asset units) + protected slot top-left; clock + next exit window top-centre; minimap (public state + own View) and district moves top-right; THE WIRE lower third; context prompt bottom-centre. |
| 3 | Two separate browser clients join and see authorised updates | **Partial** | Two human seats per raid exist and every update is on-chain (TEE). In the 3D client I saw a real BOT through my fog `View` and shot at it (`after-live-raid-bot-in-fog.jpg`). A second human browser in the same raid was not run in this session. |
| 4 | Find, open and collect a crate; unauthorised peek denied | **Built** | Raid 1795697851949 (3D client, Gunner): walked to crate 28, prompt "E · CRACK SEAL · 2 s", opened it on-chain → backpack 0 → 1.10 Harbor units (1.09 dUSD), seal flare + sparks (`after-crate-prompt-bots.jpg`, `after-crate-opened.jpg`). Earlier note: Crate opening is unchanged code (`open_crate` / `finish_open`); the 3D crate shakes, its seal strip flares and the lid opens. "Try to peek" is the real TEE read (test 8 passes). In raid 1795697137007 the nearest crate had already been taken and I was knocked out before reaching another; see raid 1795697851949 below. |
| 5 | Terminal trade with vulnerability timer, inventory changes | **Built** | Raid 1795697851949: at terminal (59, 28), prompt "E · TRADE AT TERMINAL · 3 s exposed", swapped Harbor 1.10 → Tower 1.10 at the current index, teal exposure ring while channelling, toast "Trade filled at the current price" (`after-trading-exposed.jpg`). Earlier note: Unchanged trade code (start/finish with exposure; Trader 2 s; halts; combat interrupts). 3D terminals with activation ring, red when halted. Not exercised by hand in the 3D client yet. |
| 6 | Combat and hazards meaningful, elimination consistent | **Built** | Raid 1795697137007: Tower fell 2% → hazard rows drained HP (program rule) plus BOT fire → knocked out at tile (9.7, 22.4); downed operator lies on the floor; end screen paid the protected slot + pro-rata (7.18 dUSD). |
| 7 | Extraction → genuine devnet settlement, pending vs confirmed | **Built** | Raid 1795697851949: held Space on open exit 3 in window 3 → "EXTRACTED: your backpack settles to your wallet" (pending), then after settlement the summary: 7.06 dUSD paid + 1.10 dTWR minted, claim `tXvaVjPW…`, settlement `2M7rDCMg…` (`after-extracting-beam.jpg`, `after-extracted-summary.jpg`). Earlier note: `after-end-screen.jpg`: claim `5vJJYEBK…` and settlement `5ZDuNsf7…` with explorer links. The extraction pad (pylons, ring, beam when open) is 3D; extracting by hand was not done in this session. |
| 8 | Replay / THE WIRE never falsely claim live data or leak private state | **Built** (unchanged) | THE WIRE reads public accounts only with a non-member key; test 10 passes; Mystery reveal only after the raid with a Merkle check. |
| 9 | Spectator view of real public events | **Partial** | `/watch` renders the 3D city with only public state (exposed / downed / extracted raiders, opened crates, exits, districts) from an overview camera, plus the Extraction Market. No per-raider follow camera: non-exposed positions are private by design. |
| 10 | Screenshots, style guide, commands, asset manifest, URLs, this matrix | **Built** | `docs/screens/`, `docs/STYLE_GUIDE.md`, `docs/DESIGN_REFERENCES.md`, `docs/UI_AUDIT.md`, `ASSET_CREDITS.md`; `npm run build` (tsc + vite) passes. |

## Screens
| Screen | Status |
|---|---|
| Title screen (in-engine 3D, DEPLOY primary) | Built — `after-title-3d.jpg` |
| Training Ground (offline, labelled) | Built — `after-training-fire.jpg` |
| Lobby: 3D operator on a deployment pad with class gear | Built — `after-lobby-operator.jpg` |
| In-raid HUD + minimap + prompts | Built |
| Inventory grid / loadout screen (ARC-style) | **Not built.** In-raid loot is three asset balances + the protected slot, shown in the HUD; a grid would show three cells. Classes are the loadout (lobby). |
| Trading terminal overlay | Restyled (Market Noir); shows balances per asset and exact swap direction; no price is invented. |
| Crate reveal | In-world: lid opens, seal flares, sparks, value pop + RARE / JACKPOT tier. |
| Extraction summary / Mystery reveal | Restyled; real claim + settlement signatures; Merkle-verified day. |

## Not done / limits (honest list)
- **Frame rate not measured.** The browser pane used for testing was hidden, so the browser throttled rendering to ~1 fps, and a forced-GPU-sync benchmark stalled. Adaptive quality is built in (drops bloom and pixel ratio if frames average > 25 ms over 4 s). `window.__razkyn3d.stats()` reports fps, p95 frame time and draw calls in a visible tab.
- No rigged / skinned character models: operators are original jointed primitives with procedural animation. Licensed CC0 packs (Kenney, Quaternius) were suggested but not downloaded.
- No cover / line of sight (needs a program change; see #1).
- No original sound effects beyond the existing Web Audio blips.

## Added after owner feedback (2026-11-26, afternoon)
| Item | Status | Evidence |
|---|---|---|
| Map themes: Street / Mall / Farm (title screen + Training Ground picker, saved per browser) | Built — looks only: floor paint, scenery outside the playfield, lighting, weather; rules, tiles, crates, hazards, exits unchanged | `app/src/game/three/themes.ts`; checked on the title screen and in Training Ground |
| How to play + colour legend (title menu, HELP button, H key, auto-opens on the first raid / training visit) | Built | `app/src/screens/HowToPlay.tsx` |
| Closer camera (~38°, about 40% nearer) and larger operators | Built | `RaidScene3D.ts`, `actors.ts` |
| Overhead lantern cables over the Street market (above head height) | Built | `dressing.ts` |

## Live raid with the reference pass (raid 1795704493373, Mystery, Trader, diagonal camera)
- Controls: holding S moved the raider on-chain in direction (0.479, 0.878) = exactly the camera-relative back vector; prediction offset settled to 0.
- Crate #9 opened → +0.69 Tower units (`pass2-crate-opened.jpg`).
- Terminal readout with real indices and price source "historical replay (Mystery day)", Trader "2 s" (`pass2-terminal-readout.jpg`).
- **TRADING HALT on Tower fired while I traded**: banner + red HALTED terminal, trade refused by the program, backpack unchanged (`pass2-trading-halt.jpg`). First devnet observation of a halt.
- After the halt: Tower 0.69 → Harbor 0.68, exposed while channelling, "Trade filled".
- Extracted at exit 0 in window 2 → 7.36 dUSD + 0.68 dHRB, claim `5LkaKWwg…`, settlement `5W5Tz4Ge…`; reveal "UKRAINE TENSIONS HIT CRYPTO · 22 Feb 2022", price data verified (`pass2-extracted.jpg`).

## Characters, BOT styles, time of day (2026-11-26, evening)
| Item | Status | Notes |
|---|---|---|
| Human raiders: male / female build, 6 skin tones, 6 hair styles, 6 hair colours, 6 jackets, 4 trousers, randomise | Built | `actors.ts` (same skeleton and animation as before), editor in `screens/Customize.tsx` (title CHARACTER, lobby EDIT CHARACTER, Training) |
| Other humans | Built | Look derived from their wallet address: the chain stores no avatar, so your own choice is visible to you only |
| BOT styles: Sentinel, Drone, Heavy | Built | Chosen per browser; BOTs stay red-accented and labelled BOT |
| Time of day: Sunny Day, Night, Storm (all three maps) | Built | Sky, sun / moon, fog, window lighting; Storm adds heavy slanted rain (outdoors) and lightning flashes |
All cosmetic and saved in the browser (localStorage); nothing here touches rules, positions or payouts.

## Shared avatars (2026-11-26)
- Client signs `razkyn-avatar:<raid>:<slot>:<fields>` with the seat's raid key; keeper (`keeper/wire/avatars.ts`) checks the signature AND that the key equals `Raid.raiders[slot].raid_key` on the base layer, human seats only; `GET /avatars/:raid`.
- Forgery checks against devnet raid 1795704493373 (`scripts/check-avatar-verify.ts`): invalid avatar → bad request; signature over other data → does not verify; valid signature with a non-seat key → "not the raid key for this seat"; BOT seat → "not a human seat"; nothing stored.
- Positive path on devnet raid 1795706772752: browser published slot 0 (female, ponytail, red hair, red jacket); `GET /avatars/1795706772752` returned it; rendered in the live raid (`avatar-live-raid.jpg`). Players whose browsers did not publish still get the wallet-derived look.

## RAZKYN LIVE picks (keeper-run, DECISIONS #38) — devnet raid 1795708594203
- Two independent spectator clients: the browser dev wallet `dJnD…` (watch page) and `scripts/spectator-bot.ts` (`9Ba7…`, own keypair, funded by the keeper).
- Lock by chain clock, both directions: C:4 block 1795709056 < lock 1795709061 → accepted; D:8 block 1795709058 < lock 1795709059 → accepted; D:7 block 1795709032 ≥ lock 1795709029 → LATE, refunded (5 late picks in total, all refunded).
- Live resolution from public facts: C1 → HARBOR (a district crack inside its watched minute); KNOCKOUT windows → NO (no knockouts). THE WIRE: "LIVE PICK: Harbor cracked first · 0% of spectators called it", "… nobody went down in that 30 s · 100% of spectators called it, paid 1.0×".
- Settlement: 18 bets, staked 145 dPLAY, paid 145 dPLAY (wins 40 + refunds 105) in one transaction `3wZnifqY…`; leaderboard dJnD 4/9 correct, best streak 3. Report hash posted `3y1CthsR…`.
- UI: `live-picks-watch.jpg` (cards with countdown, LOCKED stamp, share per choice, EXTRACTS rows below).
- Finding: the 3 s / 5 s locks are tight for base-layer transactions with a wallet popup (confirmation ~1–2 s); a dev wallet or quick approval is needed.

## RAZKYN LIVE on-chain (DECISIONS #39) — devnet raid 1795715322915
| Acceptance test (upgrade doc) | Status | Evidence |
|---|---|---|
| Two real clients in the same spectator session | Built | Browser dev wallet `FPizAE…` (razkyn.vercel.app/watch) + `scripts/spectator-onchain.ts` `Eh9cEc…`; both on the on-chain leaderboard |
| Prediction via the intended MagicBlock flow | Built | Pick book delegated to the TEE; session-key transactions on the Private ER; register `T3kCtE7q…`, picks e.g. `2A5EbsfG…` |
| Closes at the authoritative deadline / late rejected | Built | Program clock: late pick on pool 13 refused 6053 (PicksClosed); MagicSVM test too |
| One choice per participant / duplicate protection | Built | Duplicate on EXTRACTS r1 refused 6057 (AlreadyPicked) |
| Verified raid outcome decides the result | Built | resolve_picks reads only Raid, District, RaiderPublic (MagicSVM asserts the account list); outcomes: 8× EXTRACTS YES, NEXT CRACK NONE, KNOCKOUT NO; a real knockout resolves YES in MagicSVM |
| Cranks for closure | Built | ScheduleCrankCpi scheduled at the drop (sig in the report); the keeper also resolves as an idempotent fallback |
| Leaderboard scores update correctly | Built | 10/10 → 110 credits, 1/2 → 90; total 200 = 2 × 100 |
| Repeated requests cannot produce duplicate claims | Built | Badge claimed once (`2N3E11Gs…`, 1 token); second claim refused 6047 (AlreadyClaimed) on devnet |
| VRF reward drops | Built | Streak badge variant = hash(raid VRF seed, "streak", wallet); badge is a transferable devnet SPL token |
| Cancelled / failed raids | Built | cancel_picks refunds every open pool (MagicSVM); serve mode calls it when a raid fails |
| THE WIRE opens and results | Built | "PICKS OPEN: a knockout in the next 30 s? Locks in 3s", "LIVE PICK: no district cracked · 100% of spectators called it, paid 1.0×" |
| Awards | Built | Top Raider, Biggest Extraction, Most Dramatic Escape (wounded only), Most Knockouts, Top Spectator — report + end screen |
| Spectator cameras, streamer overlay | Built | Watch mode camera bar (overview, districts, action cam, follow public raiders); `/overlay` |
| Original 3D raid still playable / regressions | Built | 19 earlier MagicSVM tests pass; the raid ran end to end with settlement and claims |
| Finding | — | Pick confirmation from this machine ~3–3.6 s, so 3 s KNOCKOUT locks are often missed |

- Locks lengthened to 10 s / 8 s (DECISIONS #40). Devnet raid 1795716768943: 15/15 window picks accepted in time (2.9–3.8 s each), 0 missed; previous raid with 5 s / 3 s locks missed 5.
