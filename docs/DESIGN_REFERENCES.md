# Design references → original RAZKYN implementation

Principles only. No screenshots, models, textures, levels, characters, UI art, icons, sounds or branding
from these games were downloaded or used. Every RAZKYN asset is original procedural geometry or
canvas-drawn texture (see `ASSET_CREDITS.md`).

| Reference | Principle taken | RAZKYN implementation |
|---|---|---|
| The Ascent — https://store.steampowered.com/app/979690/The_Ascent/ | Three-quarter camera over real 3D geometry; vertical layering; dense industrial set dressing; light from believable sources | `RaidScene3D.ts`: perspective camera ~38° down, damped follow, limited zoom. `world.ts` / `dressing.ts`: district skylines (glass towers, factory halls with chimneys and steam, harbor cranes, containers, a moored ship), perimeter walls with ads, pipes, stairs and catwalks, gantries over the corridors, puddles, steam vents, rain. Lights: moonlight with shadows, one market light per district, terminal and exit lights, the player's shoulder lamp. |
| RUINER — https://store.steampowered.com/app/464060/RUINER/ | Readable silhouettes in chaos; fast directional aim; short high-impact feedback; red as a danger accent, not a coat of paint | Operators with distinct visor colours (you = teal, humans = amber, BOTs = red) and labels; mouse-aim reticle; torso yaws to the cursor; tracer + muzzle light + sparks + small camera shake per shot; flinch and red vignette on hit; red reserved for hazards, falling districts, halts and BOTs. |
| ARC Raiders — https://arcraiders.wiki/wiki/Game_UI | Separating what you risk from what is safe; concise rarity; clear post-raid summary | Backpack (at risk) vs **Protected slot** (4 dUSD, always yours) shown separately in the HUD; crate rarity as a strip colour + RARE / JACKPOT tiers by value; extraction receipt with explorer links. (A full grid inventory is not built: the game's loot is three asset balances, see FEATURE_EVIDENCE.) |
| THE FINALS — https://www.reachthefinals.com/patchnotes/12-00 | Broadcast grammar: lower thirds, event announcements, round clock up top, legible overlays | THE WIRE as a lower-third chyron with a slanted brand block and story tags (BREAKING / IN-GAME EVENT); market events as a top banner with countdown; clock and extraction state top-centre; spectator view is public state only. |
