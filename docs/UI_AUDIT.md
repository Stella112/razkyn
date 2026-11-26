# UI audit (before the 3D overhaul, 2026-11-26)

## What the client was
- Vite 6 + React 18 + TypeScript. Routes: `/` landing, `/play` lobby, `/raid/:id`, `/watch[/:id]`, `/report/:id`, `/history`.
- Raid map: **Phaser 3.90, 2D top-down** (`app/src/game/RaidScene.ts`): flat coloured rectangles per district, diamonds for crates, circles for raiders, a canvas-erased fog.
- Landing: a 2D canvas skyline behind marketing copy, three "how it works" cards, a tech-stack pill row.
- Theme: "neon night market": purple background, magenta / cyan / acid-green glows, CRT scanlines, Bungee display font, rounded cards everywhere.

## Problems (why it read as a Web3 dashboard, not a game)
1. The game world was a 2D diagram: no depth, no characters, no props, no lighting.
2. The landing page was a marketing page (copy blocks, cards, stack pills) instead of a title screen.
3. Every surface was a rounded glowing card; colour carried no meaning (magenta, cyan and green everywhere).
4. HUD: the clock, districts and peek panel were stacked top-right; there was no minimap and no contextual prompt, so the player had to guess what E / Space would do.
5. Emoji used as icons (🔒 🎙 🔊 ⚡ 🌀 📡 🏦 ▶ ☰).
6. Neon glows and scanlines reduced legibility.

## Must be preserved (integration checklist)
- [x] Wallet adapter (Phantom / Solflare) + dev wallet; join = one base-layer signature (`buildJoinTx`, dry-run first).
- [x] Raid key (burner) + TEE `getAuthToken`; all gameplay transactions (`move_to`, `shoot`, `open_crate`/`finish_open`, `start_trade`/`finish_trade`, `start_extract`/`finish_extract`) are built in `lib/chain.ts` and are unchanged.
- [x] Movement prediction + bounded pending moves (Raid.tsx), unchanged.
- [x] Fog of war data source: the raider's private `View` account (TEE), unchanged; the 3D scene only draws it.
- [x] "Try to peek": real `getAccountInfo` over the TEE with the player's token, unchanged.
- [x] THE WIRE SSE stream, Extraction Market (dPLAY), Report page hash + Merkle + event-plan checks, History, v1 IDL fallback.
- [x] Market events (halt / rate shock / earnings), classes, trade interruption.

The overhaul replaces only the renderer (`RaidScene.ts` → `RaidScene3D.ts`, same interface) and the presentation layer (CSS, title screen, HUD layout). Screens before/after are in `docs/screens/`.
