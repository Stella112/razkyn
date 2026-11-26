# RAZKYN style guide — Market Noir

A rain-scarred financial city at night. Industrial, grounded, readable. Colour is information.

## Palette
| Token | Hex | Meaning |
|---|---|---|
| Carbon | `#10151A` | background, panels |
| Gunmetal | `#303B43` | structure, props, borders |
| Silver | `#C8D2D1` | text, neutral light |
| Amber | `#D9AC65` | loot, primary action, sealed crates |
| Teal | `#45C9B2` | market up, safe, you, open exits, terminals |
| Red | `#E4514E` | danger, market down, hazards, halts, BOTs |

Up / down are never colour-only: always ▲ / ▼ and a signed percentage.

## Type (Google Fonts, SIL Open Font License)
- Display: **Barlow Condensed** 600–800, uppercase, tracked 0.08–0.2 em (titles, HUD numbers, buttons, prompts).
- UI: **Inter** 400–700 (body, descriptions, THE WIRE text).
- Data: **JetBrains Mono** (addresses, signatures, prices).

## Shapes
- Panels: square (2 px radius max), 1 px silver-at-14% borders, no glow, no blur.
- Primary action: solid amber with a clipped bottom-right corner.
- Accents: a 3–4 px left rule in the meaning colour (toasts, prompts, banners, THE WIRE).

## Logo
"RAZKYN" in Barlow Condensed 800 with an amber **candle wick** before it and a red **extraction slash** across it. CSS only (`noir.css` `.logo`).

## HUD rules
- At least 80% of the screen is world. Quiet by default.
- Top-left: health, backpack value (rolling) + sparkline, protected slot. Top-centre: clock + exit state. Top-right: minimap, district moves, peek. Bottom-centre: context prompt (E / Space). Bottom: THE WIRE lower third.
- Labels on data: "devnet demo", "relayed", "training" wherever they apply.

## 3D
- Camera ~38° down, three-quarter, damped follow; nothing tall south of the playfield (no occlusion); gantries fade when you are near them.
- Lights come from sources: moon, district market lights, terminals, exits, shoulder lamp, muzzle flashes.
- Bloom only on emissive sources (high threshold).
