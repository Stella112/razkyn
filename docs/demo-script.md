# RAZKYN — 2-minute demo script

Beat sheet from CLAUDE.md §11. Record at 1920×1080 (or a phone in landscape for one shot). Use a Mystery raid with 1 human + 7 BOTs on https://razkyn.vercel.app: press DEPLOY → Mystery Market → OPEN RAID (the VPS keeper opens it), join, press READY. Turn on the FPS counter in Settings only if you want it in shot.

| Time | Beat | On screen | Voice-over (short) |
|---|---|---|---|
| 0:00–0:08 | Hook | Landing: wordmark R A Z K Y N, tagline RAID. TRADE. EXTRACT., tape animation | "Eight raiders. Five minutes. The map is the market." |
| 0:08–0:20 | Join | Lobby: mode Mystery, raider list with BOT labels, one signature to stake 10 dUSD | "One signature to stake. After that, a raid key signs every move on MagicBlock's private rollup. No popups, no gas." |
| 0:20–0:35 | Peek denied | In the raid, press Try to peek: sealed crate, another raider, the raid secret → refused, lock shakes | "Crates are sealed inside a TEE. Even with my own token, I can't read them. Nobody can." |
| 0:35–0:55 | The market moves the map | Backpack value ticking with the sparkline; THE WIRE chyron calls a drop; a district flickers red and its floor cracks | "Prices move every second. A falling district cracks into hazard tiles. THE WIRE narrates — public facts only." |
| 0:55–1:15 | Trade under fire, ambush, extract | Trade at a terminal (TRADING banner, position exposed), a shot / muzzle flash, click a raider standing behind a cover block (the client shows "No line of sight" and the program would refuse the shot), then hold Space on a green exit | "Trading exposes your position. Cover is enforced on-chain: no line of sight, no shot. Exits open on a schedule — hold five seconds to bank the bag." |
| 1:15–1:35 | Reveal + debrief | Overlay: "The tape was <day> … Verified ✓", payout, debrief | "Then the reveal: the real day, proven with a Merkle proof against the root committed before the raid." |
| 1:35–1:50 | Report verify | /report/:id: Verified ✓ hash vs on-chain, Merkle ✓, conservation ✓, VRF and settlement trail | "Every raid ends in a report whose hash lives on-chain. Edit one number and it says Mismatch." |
| 1:50–2:00 | Stack slide | Pills: Private ER (TEE) · Permissions · VRF · Pricing Oracle · Magic Actions · Raid keys | "RAZKYN — raid, trade, extract. Built on MagicBlock." |

Notes
- Say "devnet demo"; never call the tokens shares or money.
- Don't show any key, token or `.env` on screen; the TEE token is never in the UI.
- If a hazard kills you on camera, keep it: the debrief and payout still show the protected slot.
