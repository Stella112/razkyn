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
